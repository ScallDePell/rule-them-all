# Contributing to Rule Them'All

This guide is for developers who change the module's code. Read [docs/architecture.md](docs/architecture.md) first: it describes the layers, the stored data and the public API. The recipes below say which files to touch for the most common changes, and which checks prove the change is complete.

## Ground rules

- The module stays generic: no game-specific identifiers, actor types or branches (`qa/architecture-audit.mjs` enforces it). Game-specific tools belong in their own module, built on the stable API.
- The module reads only the current stored format. When a change removes or renames a stored field, extend the repair (`src/configurator/stored-data-repair.mjs`, Game Settings > Rule Them'All > Repair the data) and its test `tests/convert-stored-data.test.mjs`, in the same change.
- Every persistent runtime write goes through a `RuntimeTransaction` (`src/runtime/runtime-transaction.mjs`), never straight to flags.
- A change to a stable member, method or hook of `game.ruleThemAll` (`STABLE_API` in `src/core/module-contract.mjs`) follows the versioning rule of docs/architecture.md §6.
- The interface text exists in English and French (`lang/en.json`, `lang/fr.json`). CSS follows the design-system rules checked by `tests/css-design-system.test.mjs` (colors only in `styles/tokens.css`, spacing tokens of 4 / 8 / 12 px, `@container` rather than `@media`).

## Checks

Every push to `main` and every pull request runs the `Checks` workflow (`.github/workflows/ci.yml`). Run the same commands before pushing:

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs --strict
```

Three test files catch most incomplete changes:

- `tests/contract-completeness.test.mjs`: a new reference that is not a dependency, an object kind that does not resolve to its collection, a Formula node missing from the visual editor, a missing label, a field lost by export/import or changed by the repair.
- `tests/public-api-contract.test.mjs`: a stable member, method or hook that disappeared or is undocumented.
- `tests/multiclient-foundry.test.mjs`: behaviour between several Foundry clients (a GM and two players over a simulated server, each running the real module): relayed writes, permissions, concurrent writes, combat hooks. Add a scenario there when a change concerns what one client does for another.

For interface changes, also render the windows in Chromium (see docs/architecture.md §8): `qa/configurator-render.mjs`, then `qa/dynamic-markup-audit.mjs` and `qa/layout-audit.mjs`, or `qa/sheet-render.mjs` and `qa/sheet-editor-flow.mjs` for sheets.

## Recipe: add a Formula node

A Formula node is a type of node in the expression tree of Formulas and Conditions (`max`, `lookup`, `dice`...).

1. **Register it** in `src/configurator/operation-registries.mjs` (`formulaNodeRegistry`): `id`, `evaluate(node, kit)`, `resultType` (or a function of the node), and `validate(node, label)` that throws on a malformed node. `kit` gives `ev(child)`, `context`, `parameter(id)`, `formula(id)`, `reference(ref, container)` and the other readers of the runtime evaluator (`src/runtime/runtime-evaluator.mjs`).
2. **Its references**: if the node names an entry of the Ruleset (a Parameter, a Content Type...), add it to `scanAst` in `src/configurator/dependency-index.mjs`. That one edge gives validation of missing references, deletion protection, change impact, part export and renames.
3. **Its type checks**, if it reads typed values: `src/configurator/type-checks.mjs`.
4. **The visual editor**: give it a shape in `src/configurator/entry-expression-model.mjs` (`SHAPES`, `SLOTS` if it has new slots, `OPERATION_LABELS`, and the lists returned by `editorOperations`), or an operand kind (`OPERAND_KINDS` and its labels) if it is a leaf. A node only written through import or the API goes in `NOT_IN_VISUAL_EDITOR` of `tests/contract-completeness.test.mjs`; keep that list short.
5. **Its words**: `RTA.Expression.Operation.<id>` (or `RTA.Operand.Kind.<id>`) in `lang/en.json` and `lang/fr.json`.
6. **Tests**: a unit test that validates, types and evaluates the node (see `tests/formula-operand-kinds.test.mjs` and `tests/open-registries.test.mjs`), then the checks above. `tests/contract-completeness.test.mjs` fails until steps 2, 4 and 5 are done for the cases it can see.

Another module adds its own nodes without touching this code: it registers them on the `ruleThemAllRegisterTypes` hook (`registries.formulaNodes.register(...)`).

## Recipe: add an Effect operation

An Effect operation is what an Effect does to its target value (`set`, `add`, `subtract`, `multiply`, `toggle`).

1. **Register it** in `src/configurator/operation-registries.mjs` (`effectOperationRegistry`): `id`, `targetTypes` (the value types it may write, `"*"` for any), `operand` (false when it takes none, like `toggle`) and `apply(current, operand)`, which must be pure.
2. **Its words**: `RTA.EffectOperation.<id>` in both languages (its `labelKey`). The Effect editor offers every registered operation (`effectOperationChoices` in `src/configurator/configurator-entry-editor.mjs`) and hides the operand when `operand` is false.
3. **Type checks**: `src/configurator/type-checks.mjs` checks the target and operand types through `effectOperationRegistry.accepts`; nothing to add unless the operation has a new rule.
4. **Runtime**: `src/runtime/runtime-engine.mjs` applies any registered operation; bounds (pool minimum and maximum) apply after it.
5. **Tests**: an engine test that applies it and records it in the ledger (see `tests/open-registries.test.mjs`, "a module-registered Effect operation runs in the engine"), then the checks above.

A new kind of Effect target (not a new operation), like `targetContentField`, is a change of the Effect contract: `prepareEffect` in `src/configurator/rule-contracts.mjs`, the dependency edges, the editor (`templates/configurator/entry-editor.hbs`, `src/configurator/entry-data-collector.mjs`), the engine, and the repair if an existing field changes.

## Recipe: change a sheet field (block)

Sheets are `SheetDefinition.root` trees of layout nodes (containers such as tabs and sections, leaves such as values and actions). Adding an option to a block, for example a new display of a value next to `gauge`, `dots` and `clock`, touches each layer once:

1. **Contract**: `src/configurator/layout-contract.mjs` (`LAYOUT_VALUE_DISPLAYS`, `LAYOUT_COUNTED_DISPLAYS` and the checks in `prepareLayout`). Stored sheets are validated there; an option outside the contract is refused at save.
2. **Runtime projection**: `src/runtime/sheet-projection.mjs` computes what the block shows (value, maximum, words) with Permissions applied; writes from the sheet go through `src/runtime/sheet-writes.mjs`.
3. **Rendering**: `src/ui/sheet-markup.mjs` (`valueControl` and its helpers) and the styles in `styles/sheet.css`, with colors as tokens from `styles/tokens.css`.
4. **Editor**: the palette in `src/configurator/sheet-layout-model.mjs` (what a new block starts with), the settings in `src/ui/sheet-editor-markup.mjs` (and its icon), and their handling in `src/configurator/sheet-layout-controller.mjs`. The display choices come from `LAYOUT_VALUE_DISPLAYS`.
5. **Words**: `RTA.SheetEditor.Display.<id>` and any new setting label in both languages.
6. **Tests**: `tests/sheet-blocks.test.mjs` and `tests/sheet-layout-model.test.mjs`, then render with `qa/sheet-render.mjs` and `qa/sheet-editor-flow.mjs` and look at the screenshots.

Renaming or removing a stored layout option needs the repair (ground rules).

## Recipe: add a reference between entries

A reference is a field of one entry that names another (`Action.tableRef`, `Test.outcomeRefs`, `Effect.targetRef`).

1. **Name it** `<something>Ref` (one id), `<something>Refs` (a list) or, for a value inside a Definition, a reference object `{objectKind, objectId, capabilityId?, slotId?, outputId?}` (CP-24, `src/configurator/reference-checks.mjs`). The contract test recognises these names; an id field under another name must be added to `ID_REFERENCES` in `tests/contract-completeness.test.mjs`.
2. **Its shape**: the entry's prepare function in `src/configurator/rule-contracts.mjs` (default value, type, `null` when unset) or the matching contract file. Unknown fields are refused, so the new field must be listed there.
3. **The dependency**: add the edge in `src/configurator/dependency-index.mjs`, with the path of the field (`actions[3].tableRef`) and its strength: `required` blocks deleting the target, `optional` lets the GM delete it after clearing the field (CP-31). This one edge gives the missing-reference check in `src/configurator/configurator-validation.mjs` (warning in a draft, error at publish), deletion protection, the change impact, the closure of exported parts and rename-following on part import (`src/configurator/ruleset-parts.mjs`).
4. **The editor**: the field in `templates/configurator/entry-editor.hbs` (or the markup builder of that form in `src/ui`), its choices in `src/configurator/configurator-entry-editor.mjs`, and its reading in `src/configurator/entry-data-collector.mjs`. Use RTA Select (`src/ui/rta-select.mjs`) for the selector.
5. **The runtime**, which reads the field: usually `src/runtime/runtime-engine.mjs`.
6. **Its words** in both languages, and the GM guide (`docs/gm-guide.md`) if the GM sees it.
7. **Tests**: a reference test (see `tests/references-cp24.test.mjs` and `tests/change-impact-cp31.test.mjs`) that deletes the target, exports a part and renames on import; then the checks above. `tests/contract-completeness.test.mjs` scans the shipped Rulesets: once a shipped Ruleset uses the field, a missing edge fails there too.

## Recipe: add an assistant path

An assistant path (the Assistant button at the top of a Ruleset in the Configurator) asks a few questions and builds the entries of one rule.

1. **Declare it** in `src/configurator/assistant-paths.mjs` and add it to `ASSISTANT_PATHS`: `id`, `group` (`core`, `systems` or `bricks`), `keywords` (the search words), `produces`, `questions` and `build(ctx)`. Question kinds are listed in `QUESTION_KINDS` (`src/configurator/assistant-engine.mjs`); an `entry` question with `create: "<path>"` lets the GM create that entry inline, `fixed` imposes some of its answers, `visible(values)` shows a question only after the answers before it, and `withId` lets the GM give a name's id when other rules read it (an input read by Formulas).
2. **Build only by adding**: `ctx.add(collection, entry)` creates, `ctx.append(collection, id, field, items)` adds to a list of an existing entry, `ctx.fill(...)` sets a field still empty. Nothing existing is removed, and nothing is changed except by `ctx.replace(collection, id, field, value)` on a field listed in `REPLACEABLE_FIELDS` (`assistant-engine.mjs`), by a path that declares it in `changes`; the plan lists it in `changed`. Use `formulaOf`/`conditionOf` for expressions (an identical one is used again; a Formula node is that Formula) and `operandOf` for operands. No game rule and no default dice or difficulty in the code: names come from `ctx.t(key)` (`Text.<key>`, listed in `texts`) and `ctx.shared(key)`.
3. **Its words**: `RTA.Assistant.Path.<id>.Title`, `.Summary`, `.Limits`, `.Q.<question>.Label`, `.Option.<value>`, list fields under `.Field.<field>`, and `.Text.<key>`, in both languages. `assistantPathTextKeys` lists them; `tests/assistant.test.mjs` fails on a missing one. Give it a Font Awesome icon in `ASSISTANT_PATH_ICONS` (`src/configurator/assistant-view.mjs`); its card takes the color of the section of what it `produces`.
4. **Tests**: a test in `tests/assistant.test.mjs` that applies the path and plays what it built in the engine; for the window, `qa/assistant-flow.mjs` (browser) and `qa/assistant-render.mjs`.
5. **Acceptance**: `Rulesets/rwf/outils/rebuild-with-assistant.mjs` rebuilds every rule of the RWF Ruleset with the paths only and compares each entry; a new field of a rule contract that the paths cannot set shows there.

## Releases

See docs/architecture.md §9: bump `module.json` and `CHANGELOG.md`, push `main`, then run the `Release` workflow. The release zip is built from an explicit list of files (no `.git`, no tests, no Rulesets).
