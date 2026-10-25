# Rule Them'All: architecture

This document is for contributors. It describes the module as it stands today (1.0.20 plus the Unreleased changes in `CHANGELOG.md`). For how to use the module, see [gm-guide.md](gm-guide.md). For worked examples, see [configuration-examples.md](configuration-examples.md).

## 1. Purpose

- Rule Them'All is a **Foundry v14 module** (`module.json`: `compatibility.minimum` and `verified` are 14) that runs on top of **any game system**. It contains no rules of its own: attributes, dice, thresholds, resources, states, colors and sheets all come from the **Rulesets** the GM sets up.
- The Actor and Item subtypes are the ones the active system provides (`src/core/system-document-types.mjs`). If the system offers only one, it is used; if it offers more than one, the Content Type (and the Runtime Lab) must name one explicitly.
- Every interface label exists in French and English (`lang/fr.json`, `lang/en.json`, with the same keys). Each user can pick the module's language independently of Foundry's (client setting `rule-them-all.language`, `src/core/module-language.mjs`). Text typed into a Ruleset goes through that Ruleset's world translations (`worldLocalizations`), not the language files.
- Ready-made Rulesets live in `Rulesets/` (Real World Fantasy, SRD 5.2). They are plain `rta-ruleset` exports, are not shipped in the module zip and have no code of their own.

## 2. Layers

| Layer | Main files | Role |
| --- | --- | --- |
| Identity | `src/core/module-contract.mjs`, `module-language.mjs`, `system-document-types.mjs` | Module ID, export format, public hook names, interface language, host subtypes |
| Configurator domain | `src/configurator/configurator-api.mjs`, `configurator-registry.mjs`, `configurator-schema.mjs`, `configurator-validation.mjs`, `configurator-graph.mjs`, `rule-contracts.mjs`, `dependency-index.mjs`, `configurator-serialization.mjs`, `ruleset-parts.mjs`, `ruleset-extensions.mjs`, `sheet-templates.mjs`, `sheet-themes.mjs`, `operation-registries.mjs` | Ruleset collections, entry preparation, validation, versions and publishing, dependencies, import/export, open registries |
| Integrations | `src/integrations/integration-registry.mjs`, `integrations.mjs`, `configurator-sections.mjs`, `sheet-fields.mjs`, `field-services.mjs`, `ruleset-changes.mjs`, `src/runtime/foundry-integrations.mjs` | What other modules add to the module's windows and sheets, the sheet fields they read and fill, and the Ruleset changes they hear; no HTML, Foundry reached only through `foundry-integrations.mjs` |
| Ruleset assistant | `assistant-engine.mjs`, `assistant-paths.mjs`, `assistant-view.mjs`, `assistant-app.mjs`, `src/ui/assistant-markup.mjs` | Guided paths: questions read into answers, a plan of entries to create, lists to append to and empty fields to fill (never a change to what exists), validated on a candidate Ruleset and written in one save (`applyAssistant`); the window draws a path's questions and the plan |
| Storage | `configurator-storage.mjs`, `world-setting-storage.mjs`, `stored-data-repair.mjs` | The snapshot format, its Foundry world settings, and the one-off repair of older data |
| Configurator windows | `configurator-app.mjs`, `configurator-window.mjs`, `configurator-entry-editor.mjs`, `sheet-layout-controller.mjs`, `foundry-dialogs.mjs`, `repair-data-menu.mjs` | Foundry and DOM orchestration only. Form collection and serialization live in separately tested modules (`entry-data-collector.mjs`, `creation-step-serialization.mjs`, `entry-expression-serialization.mjs`) |
| Presentation | `src/ui/*.mjs`, `templates/configurator/*.hbs`, `styles/*.css` | All the markup, as pure functions or Handlebars templates; no game rules and no writes |
| Runtime | `src/runtime/runtime-engine.mjs`, `runtime-evaluator.mjs`, `runtime-transaction.mjs`, `runtime-states.mjs`, `runtime-api.mjs`, `runtime-relay.mjs`, `sheet-projection.mjs`, `sheet-writes.mjs`, `shared-resources.mjs`, `token-bars.mjs`, `module-event-queue.mjs`, `creation-plan.mjs`, `creation-sessions.mjs` | Generic execution: tests, actions, effects, states, durations, progression, reactions, initiative, sheets as data |
| Foundry bridge | `src/runtime/foundry-*.mjs`, `rule-them-all.mjs` | Data adapter, playable sheets, character creation, chat cards, dice, initiative, defeated marks, token bars, shared resources panel, reactions, Content Items |

The boundaries:

- The domain and the runtime never produce HTML; only `src/ui` and the templates do. `qa/release-readiness.mjs` checks this (`presentation-boundary`), along with locale parity, localized templates and the split of the entry editor controller.
- The presentation layer never decides mechanics or persistence.
- Foundry documents, settings and applications are handled in `src/runtime/foundry-*.mjs`, the configurator windows, `world-setting-storage.mjs`, `stored-data-repair.mjs` and `rule-them-all.mjs`. Other modules may read `game` (current user, i18n) but always through optional access or injected dependencies, so they run in plain Node tests.
- `MODULE_ID` is declared once, in `module-contract.mjs`. `qa/architecture-audit.mjs` checks this, together with relative imports, the absence of game-specific branches or Actor types, and the presence of the core locale keys and boundary files.

## 3. Startup (`rule-them-all.mjs`)

| Foundry hook | What happens |
| --- | --- |
| `init` | `game.ruleThemAll` is created and also exposed as `game.modules.get('rule-them-all').api`. Settings and menus are registered (Configurator, **Repair the data**, language, storage, `worldRuntime`). Initiative, initiative passes and defeated marks are installed on the Combat class, the Ruleset sheets are registered, then `ruleThemAllInit` fires. |
| `i18nInit` | If the user chose a module language, its texts replace the module's (not Foundry's). |
| `setup` | `ruleThemAllRegisterTypes` fires with the open registries. |
| `ready` | The configurator API loads from storage (`game.ruleThemAll.configuratorReady` is its promise). Then the runtime API, GM relay, reactions, chat cards, token bars, creation button, shared resources panel, Runtime Lab, Content bridge and creation sessions are set up, Ruleset dice and named sheets are registered, the active GM initializes shared containers, and `ruleThemAllReady` fires. If loading fails (data in a former format), the GM gets a permanent notification pointing to the repair menu. |

After `ready`, the module listens to `updateWorldTime` (state expiry, `rta.time.elapsed`), the combat hooks (`combatTurnChange`, `updateCombat`, `updateCombatant`, `deleteCombatant`, `deleteCombat`) and the Item/Actor hooks (`preCreateItem`, `createItem`, `deleteItem`, `createActor`) for Content acquisition and Actor templates. Writes that must happen once are done by the active GM (`game.users.activeGM?.isSelf`) or by the client that started the change (`foundry-content-hooks.mjs`), since v14 broadcasts these hooks to every client.

## 4. Data

### Configurator storage

- In the world, the configurator data is a `configuratorStorage` index (`storageVersion: 4`) plus one world setting per Ruleset version (`rulesetVersion.<versionId>`), so a save only sends the versions that changed (`world-setting-storage.mjs`). The index is written last.
- The configurator itself only sees an assembled `storageVersion: 3` snapshot: `{storageVersion, storageRevision, activeVersionId, rulesetFamilies, worldLocalizations}` (`configurator-storage.mjs`). Each family holds RulesetVersion records with a `workingDraft` and a `publishedSnapshot`. Play uses the published snapshot; the Runtime Lab ("Try the rules") uses the draft.
- Every mutation goes through `createConfiguratorAPI`: it runs on a copy of the registry, checks `storageRevision` against what is stored (a mismatch is a conflict error), increments it and saves. Only a GM can save.
- Older formats are never read by the module itself. `src/configurator/stored-data-repair.mjs` converts them (the single-setting `storageVersion: 3` layout, older Ruleset shapes); `storageVersion` 2 and earlier are not supported at all. The GM runs it from Game Settings → Rule Them'All → **Repair the data** (`repair-data-menu.mjs`, an ApplicationV2 menu): it shows what would change, downloads a backup (`rule-them-all-backup-before-conversion.json`), writes, then reloads the world. When a stored format is retired, add its conversion there, not a reader elsewhere.

### Files

| Format | Module | Content |
| --- | --- | --- |
| `rta-ruleset` (formatVersion 3) | `configurator-serialization.mjs` | A whole RulesetVersion record, optionally with its world translations. The only Ruleset format read and written. |
| `rule-them-all-part` (formatVersion 1) | `ruleset-parts.mjs` | Selected entries plus their dependencies (from `DependencyIndex`), the entries the recipient is expected to have (`expects`), and the world translations they use. |
| part with an `extension` header | `ruleset-extensions.mjs` | An extension: `{id, name, version, target: {rulesetId, minVersion?}}`. |
| `rule-them-all.sheet`, `rule-them-all.sheet-template`, `rule-them-all.sheet-theme` | `sheet-templates.mjs`, `sheet-themes.mjs` | A sheet, a sheet template or a sheet theme on its own. |

- **Parts.** On import (`planRulesetPartImport`, then `importRulesetPart` with decisions), identical entries are skipped, and each conflicting entry is kept, replaced or imported as a copy under a new ID. When an entry is renamed, the part's references follow it through the edge paths in `DependencyIndex` (plus Action event payload keys). A reference the index cannot see would not follow, so any new kind of reference must be added to the index.
- **Extensions.** Installing refuses another Ruleset or a Ruleset older than `minVersion`. The Ruleset keeps an `extensions` record per installed extension (entries added, entries replaced with their previous content, renamed IDs). A newer version replaces the extension's own entries without asking and removes those it dropped; removal deletes what it added and restores what it replaced, and is refused while the Ruleset's own entries use what it added.

### Runtime data

- Each container (Actor, Item, the world, a combat) has a runtime state and a ledger. On Documents they are the flags `rule-them-all.runtimeState` and `rule-them-all.runtimeLedger`; the world's live in the hidden world setting `worldRuntime`; a combat's in the Combat's flags.
- Every persistent game write goes through `engine.transaction` (`runtime-transaction.mjs`: prepare, validate revisions and permissions, commit, ledger, undo through `compensate`). Adapters (`foundry-runtime-adapter.mjs`, and `memory-runtime-adapter.mjs` for tests) expose `load`, `loadLedger`, `write`, `canWrite`, `subject`, `worldTime` and `listContainers`, plus `roll`, `describe`, `reset`, `activeCombat`, `distance` and `nearby`.
- A write that the current user cannot make on a Document goes to the active GM client (`runtime-relay.mjs`, `RELAYED_METHODS`); the GM replays it with the requesting user's permissions. Foundry does not say who sent a module socket message, so the request is written in the requester's own User document (`flags.rule-them-all.relay.<id>`), which Foundry's server lets only that user or a GM write: the GM serves it only when the `updateUser` author is that user, never for a GM, an absent user or another author (such a request is removed unserved). The GM writes the answer in the same User document (`flags.rule-them-all.relayAnswer.<id>`), and the requester takes it only when the `updateUser` author is a GM, then removes both; nothing of the relay travels on the module socket. Requests and answers are JSON text, since Foundry expands dotted keys inside an update. Requests run one after the other on the GM client. Module events (`emitSystemEvent`) also run one after the other on a client, whoever emits them.
- Sheets write to the runtime (`writeSheetValue`, `sheet-writes.mjs`), never to the host system's data. What a sheet shows is computed by `sheet-projection.mjs`, with Permissions applied before anything reaches the client.
- Character creation sessions are stored in each user's flags until finalized (`creation-sessions.mjs`).

## 5. Foundry integration

| Feature | Files | Notes |
| --- | --- | --- |
| Sheets | `foundry-sheets.mjs` | Actor and Item sheets for any type, offered next to the system's sheets, never forced. Each enabled SheetDefinition of the active Ruleset is also offered by name. |
| Sheet themes | `sheet-themes.mjs`, `src/ui/sheet-style.mjs`, `styles/tokens.css` | Module themes `parchment`, `gothic`, `scifi`, `plain`, scoped as `.rta-sheet-theme--<id>`; Ruleset themes (`sheetThemes`) save a base theme with overrides (colors, fonts, frame image). |
| Chat cards | `foundry-chat.mjs` | Action cards carry their Foundry Rolls and follow the chat roll mode (Dice So Nice, blind rolls). Card buttons run another Action (`runChatAction`) for the GM, the player or each target. |
| Dice | `foundry-dice.mjs` | Each Ruleset Die becomes a Foundry `DiceTerm`, so chat messages rebuild it. |
| Initiative | `foundry-initiative.mjs` | Ruleset initiative Test, passes, reroll each round. A combat flagged `rule-them-all.singlePass` has one pass per round. |
| Defeated | `foundry-defeated.mjs` | `initiative.defeatedConditionRef`: the Condition marks the combatant (and the token status) defeated while it holds. Only a change of the Condition moves the mark, so the GM's own toggle stays. |
| Token bars | `token-bars.mjs`, `foundry-token-bars.mjs` | A pool slot with a maximum or a bounded value can be a bar (`rta.<definitionId>.<slotId>` or `rta.<definitionId>`). Values are cached per Actor and are read-only on the token. |
| Shared resources | `shared-resources.mjs`, `foundry-shared-resources.mjs`, `src/ui/shared-resources-markup.mjs` | `Ruleset.sharedDefinitions` held by the world or by the current combat; a panel opened from the combat tracker. Everyone sees what they may read; only the GM changes values. |
| Module events | `module-event-queue.mjs`, `src/configurator/system-events.mjs` | `rta.combat.start`, `rta.combat.round`, `rta.combat.turn`, `rta.combat.end`, `rta.time.elapsed`, emitted by the active GM in strict batch order. A combatant hears its turn once per round, combatant and pass; one failing Trigger does not stop the rest of the batch. |
| Reactions | `foundry-reactions.mjs` | An offer is sent over the module socket to the reacting Actor's player. |
| Creation and Contents | `foundry-creation.mjs`, `foundry-content-bridge.mjs`, `foundry-content-hooks.mjs` | Creation window from the Actors directory; Content Items acquired and released; Actor Contents apply their template to a new Actor. |

Every value read from Foundry passes through `foundryJSON` (`foundry-data.mjs`) to become plain JSON.

## 6. Public API and extension points

`game.ruleThemAll` (the same object as `game.modules.get('rule-them-all').api`). API version **1.2.0** (`game.ruleThemAll.apiVersion`, `API_VERSION` in `module-contract.mjs`).

| Member | Stability | Content |
| --- | --- | --- |
| `apiVersion` | stable | The version of this API (below). |
| `configurator` | stable | The configurator API (`configurator-api.mjs`). Stable: `listRulesetFamilies`, `listRulesetVersions`, `getRulesetVersion`, `getRuleset`, `getPublishedRuleset`, `getActiveVersionId`, `setActiveVersionId`, `createRuleset`, `publishRuleset`, `validateRuleset`, `diagnoseRuleset`, `analyzeChangeImpact`, `exportRuleset`, `importRuleset`, parts (`listPartDependencies`, `exportRulesetPart`, `planRulesetPartImport`, `importRulesetPart`), extensions (`planExtensionInstall`, `installExtension`, `removeExtension`), `subscribe`, the Ruleset assistant (`listAssistantPaths`, `describeAssistantPath`, `describeAssistantCatalog`, `assistantTextKeys`, `planAssistant`, `applyAssistant`, below); and for each entry collection `get<Kind>`, `list<Collection>`, `create<Kind>` (`registerDefinitionType` for Definition Types), `update<Kind>`, `delete<Kind>`. |
| `configuratorReady` | stable | Promise resolved with `configurator` once storage is loaded. |
| `runtime` | stable | The runtime API (`runtime-api.mjs`) on published Rulesets. Stable: `getContainerState`, `describeContainer`, `initializeContainer`, `setDefinitionState`, `writeSheetValue`, `projectSheet`, `evaluateFormula`, `evaluateCondition`, `roll`, `executeTest`, `previewAction`, `describeActionInputs`, `executeAction`, `emitEvent`, `rollInitiative`, `describeShared`, `setSharedValue`, `tokenBarValue`, `advance`, `acquire`, `getLedger`, `compensate`. Its other methods are internal. |
| `chat.postActionCard(result, versionId, {speaker})` | stable | Posts the chat card of an Action that another module ran with `runtime.executeAction`, as the sheet would. |
| `registries` | stable | The open registries `valueTypes`, `formulaNodes`, `effectOperations`; register on `ruleThemAllRegisterTypes`. |
| `integrations` | stable | What other modules add to Rule Them'All's windows and sheets, and the sheet fields they read and fill (below). Register on `ruleThemAllRegisterIntegrations` or at any later time. |
| `runtimeLab` | internal | The runtime API on working drafts, for the GM sandbox only. |
| `content`, `creation`, `language` | internal | The Content bridge, the character creation sessions, and the chosen interface language if any. |

Hooks, all stable:

- Lifecycle: `ruleThemAllInit` (end of `init`), `ruleThemAllRegisterTypes` (during `setup`, with `{valueTypes, formulaNodes, effectOperations}`: other modules add value types, formula nodes and effect operations there), `ruleThemAllRegisterIntegrations` (during `setup`, with `integrations`), `ruleThemAllRulesetChanged` (the `onRulesetChange` payload, below), `ruleThemAllReady` (after the APIs are ready).
- Runtime (`RUNTIME_HOOKS` in `module-contract.mjs`): `ruleThemAllTestResolved`, `ruleThemAllEvent`, `ruleThemAllActionExecuted`, `ruleThemAllLedgerEntry`, `ruleThemAllReactionOffered`, `ruleThemAllChoiceOffered`.
- Contents: `ruleThemAllCreationCompleted`, `ruleThemAllContentAcquired`, `ruleThemAllContentReleased`, `ruleThemAllContentLibrariesSynchronized`.

### Ruleset assistant for other modules

The assistant (`assistant-engine.mjs`) turns answers to a path's questions into new entries of a draft. Another module (a rule designer, an import script) uses it the way the window does:

- `describeAssistantCatalog({texts})`: every path and every question, visible or not, for a program that fills paths: words (`texts` maps the keys of `assistantTextKeys()` to words, else the keys stay), kind, options, accepted entries (`accept`), the path that creates a new entry (`create`), defaults, `visibility` (`dependsOn`, and `shownWhen`: the combinations of choice or true/false answers that show it), and `answerFormats`, how each question kind is answered.
- `describeAssistantPath(versionId, pathId, answers, {texts})`: the questions shown now for these answers, with the entries of this Ruleset each entry question may use (`choices`).
- `planAssistant(versionId, pathId, answers, {texts})`: validates without writing anything. `{valid, errors: [{path, code, detail}], warnings, created, added, filled, reused, main, fingerprint}`; `errors` name the answer at fault (`items[1].linked`) and are meant to be read by a program too.
- `applyAssistant(versionId, pathId, answers, {texts, baseFingerprint})`: one validated write. With the `fingerprint` of the plan as `baseFingerprint`, it throws (`error.code` `ASSISTANT_STALE`) if the draft changed since that plan; an invalid plan throws `ASSISTANT_INVALID`.

`integrations.registerAssistantPanel({id, ownerModule, title, icon, isVisible?(context), render(element, assistant)})` adds a panel at the top of the assistant window. Rule Them'All draws the panel's frame (title, icon) and gives `render` an empty element, filled once and kept while the window is open (the window may be drawn again around it); `render` may return a function called when the window closes. `assistant` offers `state()` (`{versionId, rulesetId, readOnly, pathId, answers, plan}`), `catalog()`, `describePath(pathId, answers)`, `plan(pathId, answers)`, `openPath(pathId, answers)` (shows that path with these answers in the form) and `onChange(listener)`. A panel never writes: the GM applies the plan with the window's Apply button. Registering the same `id` again replaces the panel; a panel that throws shows an error line in its frame and the window goes on.

### Integrations for companion modules

`game.ruleThemAll.integrations` (`src/integrations/`). Rule Them'All never knows the modules that use it: it offers places and services, draws the buttons and frames itself (no other module patches its HTML), and checks every read and write when it serves it, never only through the button that led to it.

- **Members:** `apiVersion`, `capabilities`, `registerAssistantPanel`, `unregisterAssistantPanel`, `listAssistantPanels`, `registerConfiguratorSection`, `unregisterConfiguratorSection`, `listConfiguratorSections`, `refreshConfigurator`, `listSheetDefinitions`, `listBindableFields`, `describeField`, `listSourceCandidates`, `resolveSource`, `validateTarget`, `updateTarget`, `registerSheetFieldAction`, `unregisterSheetFieldAction`, `listSheetFieldActions`, `onRulesetChange`.
- **Version and capabilities.** `capabilities` lists what this version offers: `assistantPanels`, `configuratorSections`, `cardHost`, `sheetFields`, `fieldSources`, `fieldTargets`, `sheetFieldActions`, `rulesetChanges`. A module checks `apiVersion` (the API version above, also on `game.ruleThemAll.integrations`; same major) and the capabilities it needs, and stays on its own otherwise.
- **Registries.** `registerAssistantPanel`, `registerConfiguratorSection` and `registerSheetFieldAction` take a descriptor with an `id` (prefixed by the module, `my-module.generate`), may be called at any time, replace an earlier registration with the same `id`, and return the function that removes it (`unregister…(id)` too; `list…()` shows what is registered). A callback that throws is reported in the console (`Rule Them'All | Integration <id> failed`) and never stops a window or a sheet from drawing.
- **Configurator sections** (`registerConfiguratorSection({id, ownerModule, parentGroup, after?, title, icon, isVisible?(context), cards})`): a view in the menu section `parentGroup` (`general`, `definitions`, `content`, `rules`, `orchestration`, `systems`, `tools`), right after the view `after` (`sheetDefinitions` is Sheets), in the section's color. `cards.list(context)` gives the cards (`{id, name, description?, image?, enabled, order, tags?: [{id, name, color?}], badges?: [{icon?, label}], invalid?: {message}}`), drawn like the Ruleset's own (tiles or lines, tag filters, right-click). The other callbacks are optional, each missing one hides its button or menu line: `create(context)`, `open(id, context)`, `duplicate`, `setEnabled(id, enabled, context)`, `remove` (Rule Them'All asks for confirmation first), `reorder(ids, context)`, `canMutate(context)`. `context` is `{rulesetId, versionId, ruleset, record, user: {id, isGM}}`. The cards belong to the module: Rule Them'All does not store, validate, export or lock them. `refreshConfigurator()` draws the configurator again when they change. A view whose section is gone falls back to General.
- **Sheet fields** (`sheet-fields.mjs`). A field is named by a FieldRef `{rulesetId, sheetId ("auto" for the AUTO sheet), target: "actor" | "item", contentTypeId?, nodeId? | slot?}`; the slots are the standard header's `header.img` and `header.name`, and on an Item sheet `template.image` (its Content Template's picture). `listSheetDefinitions(rulesetId, {versionId?, source})`, `listBindableFields(rulesetId, sheetId, {versionId?, source, target, contentTypeId?})` and `describeField(ref, {versionId?, source, nodeKind?})` read a Ruleset (`source` `"published"` by default, or `"draft"`; the version is the one named, else the active one of that Ruleset, else its last). A field descriptor is `{ref, label, nodeKind, valueKind: "text" | "richText" | "image", scope: "instance" | "definition", storage, writable, writeBy?, seenBy?, conditional, inRepeater}`; numbers and states are never fields. `describeField` answers `{status: "missing", reason}` when the sheet or node is gone and `{status: "typeChanged", previous, current}` when the node changed kind, never another node in its place; on a draft, `publishedMissing: true` when the published Ruleset lacks it.
- **Sources** (`field-services.mjs`). `listSourceCandidates(rulesetId, {sheetId?, target, contentTypeId?, versionId?, source})` lists what may be read (fields, values with `hasNarrative` when a description scale words them, Parameters, Formulas, Content Types, the Contents held, the Document's image and name). `resolveSource({documentUuid}, source)` reads one for the current user, under that Document's Ruleset version: `{kind: "field", ref}`, `{kind: "output", reference, narrative?}`, `{kind: "parameter", parameterRef}`, `{kind: "formula", formulaRef}`, `{kind: "content", contentTypeId}`, `{kind: "contents", contentTypeIds?}`, `{kind: "document", path: "img" | "name" | "token"}`. Values are read through the sheet projection, so Permissions, `seenBy` and `visibleIf` apply, and with `narrative` only the scale's words are returned, never the number. The answer is `{status: "ok", valueKind, value, label}` or `{status: "forbidden" | "missing" | "unavailable" | "rulesetMismatch", reason}`, never a part of a value the user may not read.
- **Targets.** `validateTarget({documentUuid}, ref)` answers `{allowed: true, descriptor, current}` or `{allowed: false, code, reason}` with `code` among `MISSING`, `TYPE_CHANGED`, `FORBIDDEN`, `GM_ONLY`, `NOT_ON_SHEET`, `RULESET_MISMATCH`, `DEFINITION_VALIDATED`, `NOT_OWNED_CONTENT`. `updateTarget({documentUuid}, ref, value, {expectedCurrent?})` checks again, refuses with `CONFLICT` when the field no longer holds `expectedCurrent` and with `INVALID_VALUE` a value of the wrong kind, then writes through the owner of the data: notes and Content fields through `runtime.writeSheetValue` (transaction, ledger, GM relay), the Document's image and name with `document.update` and its token image as the sheet's camera does (only for a user who may change the Document), a picture of the Ruleset (`scope: "definition"`) only by a GM, in the draft, refused with `DEFINITION_VALIDATED` on a validated version (`draftOnly: true`: play sees it once published). It returns `{ok: true, previous, current}`, `previous` being what a module keeps to offer going back. Notes inside a list are not targets; there is no GM relay for a player writing a Document they may not change.
- **Field actions** (`registerSheetFieldAction({id, ownerModule, icon, label, matches(field, context), isVisible?(context), execute(context)})`). On a played sheet, each field holds an empty place (`[data-sheet-field-actions]`, see `sheet-markup.mjs`) that the sheet fills with the actions whose `matches` and `isVisible` accept the field; when several modules offer actions on one field, one button lists them. `context` is `{document, documentUuid, documentName, rulesetId, versionId, sheetId, fieldRef, field, unlocked, editable, user}`. A field the user does not get is not drawn, so it gets no button; `unlocked` and `editable` let the module choose to show its button only on an unlocked sheet. The places are drawn only while some action is registered.
- **Changes** (`ruleset-changes.mjs`). `onRulesetChange(callback)` (and the hook `ruleThemAllRulesetChanged`) tells, once per Ruleset version and source (`"draft"` or `"published"`) that changed: `{rulesetId, versionId, source, removed, changed: {sheetDefinitions, contentTypes, contentTemplates}, removedNodes: [{sheetId, nodeId}], retypedNodes: [{sheetId, nodeId, previous, current}], removedSheets}`, so a module marks its broken references without polling.

### Stability and versioning

- **Stable** members, methods and hooks are listed in `STABLE_API` (`module-contract.mjs`); `tests/public-api-contract.test.mjs` checks that the module provides each of them, that each hook is fired, and that this section names them. A stable method keeps its name, its arguments and the shape of its result; a hook keeps its name and its arguments. Fields may be added to arguments objects, results and hook payloads at any time.
- **Internal**: everything else, including the members marked internal above, the module's source files (importing them from another module is unsupported), its flags and world settings (read and write runtime data through `runtime`, never the flags), its CSS classes and its templates. They may change in any release.
- `apiVersion` follows semantic versioning, separately from the module's version. Adding a stable member, method or hook raises the minor version. Removing one or changing it incompatibly raises the major version, and the CHANGELOG entry of that release starts with **Breaking:** and says what to change. There are no deprecated aliases: the old name goes in the same release.
- Another module checks the major version once, for example `Number(game.ruleThemAll?.apiVersion?.split(".")[0]) === 1`, and stops with a clear message otherwise.
- Ruleset files (`rta-ruleset` packages, `rule-them-all-part` parts and extensions) have their own format versions (`RULESET_PACKAGE_FORMAT_VERSION`, `RULESET_PART_FORMAT_VERSION`) and the `engineContractVersion` of the Rulesets they carry.

## 7. Interface

- The configurator is an ApplicationV2 window (`ConfiguratorWindow`); only the shell and the entry editor use Handlebars templates (`templates/configurator/configurator.hbs`, `entry-editor.hbs`). Everything else is built by the pure markup functions in `src/ui`. Dialogs use Foundry's `DialogV2`, never browser dialogs.
- **RTA Select** (`src/ui/rta-select.mjs`) is the only single/multiple selector. It wraps native selects and checkbox pickers, keeping the original inputs, names and change events. In single mode you can uncheck a choice, and clicking another option replaces it.
- Colors: the Ruleset gives each navigation section a color; a family takes its own color, and a Definition Type or Content Type its own, only where the section allows overrides. A Tag always has its own color. An unresolved color falls back to the neutral `#666666` (`ruleset-colors.mjs`). Colors are never tied to a kind of game object in CSS.
- CSS, checked by `tests/css-design-system.test.mjs`: hex colors only in `tokens.css`, one unconditional rule per selector, responsive variants in `@container` queries, no `!important` except on the hidden native select, spacing through the `--rta-gap-*` tokens (4 / 8 / 12 px), and a single type scale. Stylesheets are listed in `module.json`.

## 8. Checks

The recipes for common changes, with the files each one touches, are in [CONTRIBUTING.md](../CONTRIBUTING.md).

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs --strict
```

The `Checks` workflow (`.github/workflows/ci.yml`) runs these three commands on every push to `main` and on every pull request; the `Release` workflow runs them again before building. The tests use only Node's built-in runner (Node 22 in CI); there is no `package.json`. `tests/architecture-boundaries.test.mjs` also runs the architecture audit and checks a few key strings in this document.

`tests/contract-completeness.test.mjs` is the gate for a new reference, operation, capability or stored field: it scans the shipped Rulesets (`Rulesets/`) for every field that names another entry (`*Ref`, `*Refs`, `{objectKind, objectId}`, and the id fields listed in `ID_REFERENCES`) and fails when `DependencyIndex` has no edge for it; it checks that every object kind resolves to its collection the same way in `change-impact.mjs` and `ruleset-parts.mjs`, that every Formula node has a shape in the visual editor or is listed as API-only, that every operation, operand kind, value type and capability has its words in `lang/en.json` and `lang/fr.json`, and that export/import and the repair keep the shipped Rulesets unchanged.

`tests/multiclient-foundry.test.mjs` runs several Foundry clients over one world: `tests/helpers/foundry-sim/world.mjs` is a simulated server that keeps the world's documents and settings, refuses the writes Foundry's server refuses (a player writes only what they own, world settings are the GM's), and broadcasts every change; each client (`client.mjs`) is a worker thread with its own `game`, `Hooks` and `CONFIG` that loads the real `rule-them-all.mjs` through `init`, `setup` and `ready`. Clients only talk through documents, settings and the module socket, so relayed writes, permissions, concurrent writes and the combat hooks are tested as they happen between real clients. `client.run(fn, args)` runs a function on one client; `world.settle()` waits until no message has crossed the world for a moment. Combat scenarios run with both orders of Foundry's `updateCombat` and `combatTurnChange` hooks (`options.turnHooks`). The simulation covers what the module uses, not all of Foundry: no canvas, tokens or sheets rendering.

Chromium renders need `npm i --no-save handlebars playwright-core` and `RTA_CHROMIUM` (path to Chromium); set `RTA_FOUNDRY_CSS` to include Foundry's CSS and `RTA_SHOTS` to save screenshots. Run `node qa/configurator-render.mjs <repo> <dir>` first, then `dynamic-markup-audit.mjs`, `layout-audit.mjs` and `sheet-editor-flow.mjs` on that directory. `sheet-render.mjs`, `creation-render.mjs`, `shared-resources-render.mjs` and `part-dialogs-render.mjs` render on their own (`<repo> <outDir>`). `configurator-shoot.mjs` and `style-diff.mjs` compare computed styles and screenshots before and after a CSS change.

## 9. Releases

1. Bump `version` and the `download` URL in `module.json`, and move the Unreleased notes in `CHANGELOG.md` under the new version.
2. Run the `Release` workflow (`.github/workflows/release.yml`) from `main` with **Run workflow** (`workflow_dispatch`). It runs the tests, builds `rule-them-all.zip` (`module.json`, `rule-them-all.mjs`, `README.md`, `CHANGELOG.md`, `LICENSE`, `lang`, `src`, `styles`, `templates`, `docs`) and creates the GitHub release with the tag `v<version>` on that commit, attaching `module.json` and the zip.

Pushing a `v*` tag runs the same workflow; the tag must then match `module.json`. The manifest URL points to the latest release's `module.json`.

## 10. Known limits and technical debt

- The Node and Chromium checks don't replace hands-on testing in Foundry v14.
- `runtime-engine.mjs` is over 1,100 lines long, and `sheet-layout-controller.mjs` and `configurator-app.mjs` are close to 900. Split them up before adding more to them.
- The storage revision check is done on the client; it is not a server-side compare-and-swap.
- Rename-following in parts and extensions only sees references known to `DependencyIndex`.
- Three preview-width checks in `qa/sheet-editor-flow.mjs` fail in Chromium (this was already the case before 1.0.1).
