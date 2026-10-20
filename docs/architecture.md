# Rule Them'All: architecture

This document describes the module as it stands today. For how to use it, see [gm-guide.md](gm-guide.md). For examples, see [configuration-examples.md](configuration-examples.md).

## 1. Purpose

- Rule Them'All is a **Foundry v14 module** that runs on top of **any game system**. It contains no rules of its own: attributes, dice, thresholds, resources, states, colors and sheets all come from the **Rulesets** the GM sets up.
- The Actor and Item subtypes are the ones the active system provides (`src/core/system-document-types.mjs`). If the system offers more than one, you have to pick one explicitly on the Content Type.
- Every interface label exists in both French and English (`lang/fr.json`, `lang/en.json`, with the same keys). A Ruleset's own text goes through that Ruleset's translations.

## 2. Layers

| Layer | Files | Role |
| --- | --- | --- |
| Identity | `src/core/module-contract.mjs` | Module ID, export format, public hooks |
| Configurator (domain) | `src/configurator/configurator-api.mjs`, `-schema`, `-validation`, `-graph`, `rule-contracts.mjs`, `dependency-index.mjs` | Ruleset collections, entry preparation, validation, versions, dependencies |
| Storage | `configurator-storage.mjs`, `world-setting-storage.mjs` | One world setting for the index, plus one setting per Ruleset version |
| Configurator windows | `configurator-app.mjs`, `configurator-entry-editor.mjs`, `sheet-layout-controller.mjs` | Foundry and DOM orchestration. Data collection and serialization live in separately tested modules (`entry-data-collector.mjs`, `creation-step-serialization.mjs`, `entry-expression-serialization.mjs`) |
| Presentation | `src/ui/*.mjs`, `templates/**/*.hbs`, `styles/*.css` | All the markup; no game rules and no writes |
| Runtime | `src/runtime/runtime-engine.mjs`, `runtime-evaluator.mjs`, `runtime-transaction.mjs`, `runtime-states.mjs` | Generic execution: tests, actions, effects, states, durations, progression, reactions |
| Foundry bridge | `src/runtime/foundry-*.mjs`, `rule-them-all.mjs` | Data adapter, playable sheets, character creation, initiative, shared resources, world clock |

The boundary: the domain never produces HTML, and the presentation layer never decides mechanics or persistence. `qa/architecture-audit.mjs` and `qa/release-readiness.mjs` enforce this.

## 3. Data

- World storage: the `configuratorStorage` index (`storageVersion: 4`, split into parts). The Configurator sees a `storageVersion: 3` snapshot. Older formats are never read.
- Export/import: the `rta-ruleset` envelope is the only format read and written.
- Ruleset parts: the `rule-them-all-part` envelope (`src/configurator/ruleset-parts.mjs`) holds entries with their dependencies, taken from `DependencyIndex`, plus the entries the recipient is expected to have. On import, when an entry is renamed, the part's references follow the rename through the edge paths in the index. A reference the index can't see would not follow.
- Extensions: an extension is a part with an `extension` header (`ruleset-extensions.mjs`). The Ruleset keeps an `extensions` record (entries added, entries replaced along with their previous content, renamed IDs) so the extension can be updated or removed later.
- When a stored format is retired, `src/configurator/stored-data-repair.mjs` converts it. The GM runs it from Game Settings → Rule Them'All → **Repair the data** (`repair-data-menu.mjs`), which shows the changes, downloads a backup, then writes. The rest of the module only reads the current format.
- Every persistent game write goes through `engine.transaction` (ledger, undo). Adapters expose `load`, `loadLedger`, `write`, `canWrite`, `subject`, `worldTime` and `listContainers`.
- Sheets write to the runtime (`writeSheetValue`), never to the host system's data.

## 4. Extension points

- `game.ruleThemAll`: the Configurator and runtime API. `game.ruleThemAll.chat.postActionCard(result, versionId, {speaker})` posts the chat card for an Action that another module ran with `runtime.executeAction`.
- Hooks: `ruleThemAllTestResolved`, `ruleThemAllEvent`, `ruleThemAllActionExecuted`, `ruleThemAllLedgerEntry`, `ruleThemAllReactionOffered`, `ruleThemAllChoiceOffered`.
- `ruleThemAllRegisterTypes` (during `setup`): other modules use it to add value types, formula nodes and effect operations.

## 5. Interface

- **RTA Select** is the only single/multiple selector. In single mode, you can uncheck a choice, and clicking another option replaces it.
- Colors: an element uses its Definition Type or Content Type color, or its family's color otherwise. A Tag always has its own color. With no color, the rail stays neutral.
- CSS (checked by the tests): one stylesheet per component, colors only in `tokens.css`, no `!important` (one exception for the native select), `@container` rather than `@media`, and 4/8/12 px spacing through `--rta-gap-*`.

## 6. Checks

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs
```

Chromium renders (set `RTA_CHROMIUM`, and `RTA_FOUNDRY_CSS` for Foundry's CSS): run `qa/configurator-render.mjs` first, then `dynamic-markup-audit.mjs`, `layout-audit.mjs`, `sheet-editor-flow.mjs`, `sheet-render.mjs`, `creation-render.mjs`, `shared-resources-render.mjs` and `part-dialogs-render.mjs`.

## 7. Known limits and technical debt

- The Node and Chromium tests don't replace hands-on testing in Foundry v14.
- `runtime-engine.mjs` is over 1,000 lines long. Split it up if more mechanics get added to it.
- Three preview-width checks in `qa/sheet-editor-flow.mjs` fail in Chromium (this was already the case before 1.0.1).
