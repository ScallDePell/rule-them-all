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
| `ready` | The configurator API loads from storage (`game.ruleThemAll.configuratorReady` is its promise). Then the runtime API, socket relay, reactions, chat cards, token bars, creation button, shared resources panel, Runtime Lab, Content bridge and creation sessions are set up, Ruleset dice and named sheets are registered, the active GM initializes shared containers, and `ruleThemAllReady` fires. If loading fails (data in a former format), the GM gets a permanent notification pointing to the repair menu. |

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
- A write that the current user cannot make on a Document goes to the active GM client over the module socket (`runtime-relay.mjs`, `RELAYED_METHODS`); the GM replays it with the requesting user's permissions.
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

`game.ruleThemAll` (the same object as `game.modules.get('rule-them-all').api`):

| Member | Content |
| --- | --- |
| `configurator` | The configurator API (`configurator-api.mjs`): Rulesets, versions, publish, export/import, entries (`create*`, `update*`, `delete*`), parts (`listPartDependencies`, `exportRulesetPart`, `planRulesetPartImport`, `importRulesetPart`), extensions (`planExtensionInstall`, `installExtension`, `removeExtension`), `subscribe`. |
| `configuratorReady` | Promise resolved with `configurator` once storage is loaded. |
| `runtime` | The runtime API (`runtime-api.mjs`) on published Rulesets: `executeAction`, `executeTest`, `roll`, `projectSheet`, `writeSheetValue`, `advance`, `acquire`, `rollInitiative`, `describeShared`, `tokenBarValue`, `getLedger`, `compensate` and more. |
| `runtimeLab` | The same API on working drafts, for the GM sandbox only. |
| `chat.postActionCard(result, versionId, {speaker})` | Posts the chat card of an Action that another module ran with `runtime.executeAction`, as the sheet would. |
| `content`, `creation` | The Content bridge and the character creation sessions. |
| `registries`, `language` | The open registries, and the chosen interface language if any. |

Hooks:

- Lifecycle: `ruleThemAllInit` (end of `init`), `ruleThemAllRegisterTypes` (during `setup`, with `{valueTypes, formulaNodes, effectOperations}`: other modules add value types, formula nodes and effect operations there), `ruleThemAllReady` (after the APIs are ready).
- Runtime (`RUNTIME_HOOKS` in `module-contract.mjs`): `ruleThemAllTestResolved`, `ruleThemAllEvent`, `ruleThemAllActionExecuted`, `ruleThemAllLedgerEntry`, `ruleThemAllReactionOffered`, `ruleThemAllChoiceOffered`.
- Contents: `ruleThemAllCreationCompleted`, `ruleThemAllContentAcquired`, `ruleThemAllContentReleased`, `ruleThemAllContentLibrariesSynchronized`.

## 7. Interface

- The configurator is an ApplicationV2 window (`ConfiguratorWindow`); only the shell and the entry editor use Handlebars templates (`templates/configurator/configurator.hbs`, `entry-editor.hbs`). Everything else is built by the pure markup functions in `src/ui`. Dialogs use Foundry's `DialogV2`, never browser dialogs.
- **RTA Select** (`src/ui/rta-select.mjs`) is the only single/multiple selector. It wraps native selects and checkbox pickers, keeping the original inputs, names and change events. In single mode you can uncheck a choice, and clicking another option replaces it.
- Colors: the Ruleset gives each navigation section a color; a family takes its own color, and a Definition Type or Content Type its own, only where the section allows overrides. A Tag always has its own color. An unresolved color falls back to the neutral `#666666` (`ruleset-colors.mjs`). Colors are never tied to a kind of game object in CSS.
- CSS, checked by `tests/css-design-system.test.mjs`: hex colors only in `tokens.css`, one unconditional rule per selector, responsive variants in `@container` queries, no `!important` except on the hidden native select, spacing through the `--rta-gap-*` tokens (4 / 8 / 12 px), and a single type scale. Stylesheets are listed in `module.json`.

## 8. Checks

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs --strict
```

The `Checks` workflow (`.github/workflows/ci.yml`) runs these three commands on every push to `main` and on every pull request; the `Release` workflow runs them again before building. The tests use only Node's built-in runner (Node 22 in CI); there is no `package.json`. `tests/architecture-boundaries.test.mjs` also runs the architecture audit and checks a few key strings in this document.

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
