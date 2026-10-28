# Changelog

## Unreleased

## 1.2.7

- Assistant, **State**: a list of **changes of the game system's data** while the state lasts (data path, mode, value).
- Assistant, new path **React to a roll of the system** (Game systems): an Event Type following a Foundry hook (`dnd5e.rollAttack`), with where the Actor, the roll total and the item are read, a Condition "only for the item named, when the total reaches a mark" (the target's AC through System data) and the Trigger running the Actions you choose. A dnd5e weapon that saps Strength on a hit is now built with the assistant only.

## 1.2.6

- **Events from the game system**: an Event Type can follow a **Foundry hook**, such as dnd5e's attack roll (`dnd5e.rollAttack`). You say where the acting Actor and each payload field are in the hook's arguments; the player's targets are the target role. A Trigger on that event runs its Actions on its own: a dnd5e weapon can now apply a Rule Them'All state when its attack hits, with no macro.
- **System data** operand in Formulas and Conditions: reads a value of the game system's own data on an Actor (the target's dnd5e Armor Class `system.attributes.ac.value`).
- `runtime.emitEvent` goes through the connected GM when the event's Actions write on Actors the user doesn't own.

## 1.2.5

- **System changes** for states: a Definition with a state can list changes of the game system's own data (data path, mode, value). While the state is active on an Actor, a Foundry Active Effect makes them, once per stack, and it is removed when the state ends. In a dnd5e world, a weapon whose attack applies "Weakened" (`system.abilities.str.value`, Add, `-2`) to its target lowers the target's dnd5e Strength. The connected GM's client keeps the effects in step.

## 1.2.4

- **Kind of Actor** in Formulas and Conditions (visual builder and engine, node `actor`): whether the Actor of a role is played by a player (a PC), is of one of the game system's Actor types, or was made from an Actor Content of a Content Type. A rule can now differ between PCs and NPCs.
- **Assistant: Bounds of a value** (Basics): sets the minimum or maximum of a Definition Type or of some Definitions, for everyone or **only when** a Condition holds (for example characteristics from 1 to 10, capped at 5 for PCs); in that case the old bound stays for every other case. It is the only path that changes an existing setting: the preview shows it as "before → after" under **Changed**.
- Assistant API: plans and applied results list `changed` (`[{collection, id, field, before, after}]`); the catalog gives each path's `changes`. Fields added only, the API version stays 1.2.0.

## 1.2.3

- **Sheets from a Content Type**: right-click a Content Type, **Create its sheet**, or click **Start from the Content Type** in an Item sheet's settings. The sheet starts with a section per Content Type holding its fields (each edited as its value type says), then the buttons of the Actions its templates grant (a weapon's attack). Replacing blocks already there asks first and can be undone.

## 1.2.2

- `game.ruleThemAll.integrations.apiVersion` gives the API version (as `game.ruleThemAll.apiVersion`), so a companion module checks it where it finds the integrations.
- A number field kept with no value (null) still holds null after saving the entry, instead of being removed.

## 1.2.1

- Opening an entry no longer logs "The specified value \"null\" cannot be parsed" in the console: an empty number field (for example a Content's maximum age) is drawn empty instead of with the text "null".

## 1.2.0

API version 1.2.0 (additions only). `game.ruleThemAll.integrations.capabilities` lists what this version offers.

- **Configurator sections**: another module adds its own item to the Configurator's left menu (`registerConfiguratorSection`). Rule Them'All draws its cards, Create button, right-click menu (open, duplicate, enable, delete) and drag order, and calls the module's own functions; `refreshConfigurator` redraws it.
- **Sheet fields**: `listSheetDefinitions`, `listBindableFields` and `describeField` describe the fields of a sheet a module may read or change (portrait, token, name, notes, Content fields, Ruleset images), with who sees them and whether they sit in a list.
- **Sources and targets**: `listSourceCandidates` and `resolveSource` read a field as the user's sheet shows it (Permissions, who sees the block, conditions). `validateTarget` and `updateTarget` check and write a field with the same rules as the sheet, with a clear code when refused (`FORBIDDEN`, `GM_ONLY`, `NOT_ON_SHEET`, `DEFINITION_VALIDATED`, `CONFLICT`...). A Ruleset image is changed only by a GM, on a draft; a player is never relayed through the GM.
- **Field buttons**: `registerSheetFieldAction` puts a small button next to matching fields of a played sheet, shown on hover.
- **Ruleset change signal**: `onRulesetChange` and the hook `ruleThemAllRulesetChanged` say which sheets, blocks, Content types and templates changed or were removed in a Ruleset version.

## 1.1.0

API version 1.1.0 (additions only).

- The Ruleset assistant is part of the stable API for other modules: `listAssistantPaths`, `describeAssistantPath`, `assistantTextKeys`, `planAssistant` (validates without writing, errors name the answer at fault) and `applyAssistant` (refused with `ASSISTANT_STALE` when the draft changed since the plan's `fingerprint`).
- New `describeAssistantCatalog`: every path and question, visible or not, with its words, options, accepted entries, defaults, when it shows (`visibility.dependsOn` / `shownWhen`) and how each kind of question is answered. A program that fills paths follows the assistant without changes when a path changes.
- New stable member `game.ruleThemAll.integrations` and hook `ruleThemAllRegisterIntegrations`: another module adds a panel to the assistant window (`registerAssistantPanel`). The panel can open a path with answers already filled and read its plan; only the GM's Apply button writes.

## 1.0.33

- Formulas and Conditions, in the entry editor and in the assistant, can read a **Content field**: a field of the Content the Action is used from, such as a weapon's ammunition, with an optional value when the Content has no such field. A burst can now be refused when the weapon holds fewer rounds than the burst chosen fires.

## 1.0.32

- Ruleset cards: the badges take all the room the action buttons leave, so the "active" badge of an enabled Ruleset shows in full next to its three buttons.

## 1.0.31

- The assistant's questions and preview use the entry editor's own frames and rows: label on the left, control on the right, a framed block for an entry created in place, lists as cards with their remove button. The assistant keeps only its window layout, path cards, path header and error lines as its own styles.

## 1.0.30

- The assistant window links its own stylesheet when Foundry has not loaded it. Foundry can keep the stylesheet list it read at start-up after a module update, so the window showed without its layout, could not scroll, and a chosen path opened out of sight.

## 1.0.29

- The Assistant opens from an **Assistant** button at the top of the Ruleset, next to **Import a part…**, instead of the Tools menu.
- The assistant window is easier to read: each path card has its icon and the color of the section it fills, the groups have icons, the questions and the preview sit in their own panels with more space, and both columns scroll.

## 1.0.28

- Configurator > Tools > **Assistant** replaces the recipes. It builds a Ruleset by answering questions, in 36 paths in three groups: core rules (characteristics, skills, resources, a test, an attack, a state...), systems (creation, progression, initiative) and single bricks (a Formula, an Effect, an Action, a Trigger...). A question that needs an entry lets you pick an existing one or create a new one in place. A preview lists what will be created, reused and completed, with errors on their question, before **Apply** writes everything at once. The assistant only adds: it never changes or removes an existing value. Game-neutral: no die or difficulty is imposed.
- Acceptance: the rules of the RWF 2.6.0 example Ruleset (418 entries) were rebuilt with the assistant alone and are identical to the original; the rebuilt package passes the RWF play checks (`Rulesets/rwf/outils/rebuild-with-assistant.mjs`).
- Triggers of the same event now run in the order of their cards in the configurator (drag to reorder), instead of the order they were created in.

## 1.0.27

- Module events (combat start, round, turn, end, elapsed time): a Trigger whose Action its own Conditions refuse no longer makes the whole event fail for that Actor ("Expected plain JSON data."). Events emitted at the same moment by several callers (the combat hooks and another module) now run one after the other, instead of the second being refused ("Runtime container changed since it was read").
- The GM relay removes its requests and answers with Foundry v14's `ForcedDeletion` instead of the deprecated `-=key` syntax.

## 1.0.26

- Synchronizing Contents with the Compendiums, and the Ruleset image picker, no longer log Foundry's v13 deprecation warnings: `CompendiumCollection` and `FilePicker` are read under the `foundry` namespace first. A test keeps the moved globals out of the code.

## 1.0.25

- Character creation: a step or a choice that allows a given number of options (choose 2 skills) no longer lets the player tick more. Once that many are ticked, the other options are disabled until one is unticked. The number is the step's or the choice's maximum in the Ruleset.

## 1.0.24

- A Game System that declares no Actor or Item subtype no longer stops character creation ("The active Game System exposes no Actor document type"): Rule Them'All then creates Actors and Items of Foundry's own `base` type.

## 1.0.23

- Security: the GM's answer to a relayed request no longer travels on the module socket, where any client could send a forged one (a player could make another believe their change was done, or refused). The GM writes it in the requester's User document, and the requester takes it only when Foundry names a GM as its author. A request written by anyone but its user is removed unserved instead of being left in the User document. Requests and answers are stored as JSON text, so values whose keys hold dots (Document uuids) keep their shape. A multi-client test has a player forge the answer.

## 1.0.22

- Security: a player could make the GM client write in the name of another player, or of the GM, by sending a forged request on the module socket (Foundry does not say who sent a socket message). A request to the GM is now written in the requester's own User document, which only they can write, and the GM serves it only for that author, never for a GM. Multi-client tests try the forgeries.

## 1.0.21

- CONTRIBUTING.md: recipes for adding a Formula node, an Effect operation, a sheet block option and a reference between entries, with the files to change and the checks to run. The sheet editor offers the value displays of the layout contract (`LAYOUT_VALUE_DISPLAYS`) instead of its own list.
- Public API contract: `game.ruleThemAll.apiVersion` (1.0.0) and `STABLE_API` in `module-contract.mjs` say what other modules may rely on; docs/architecture.md §6 marks each member stable or internal and gives the versioning rule (a breaking change raises the API major, with a "Breaking:" line here). `tests/public-api-contract.test.mjs` checks the module still provides every stable member, method and hook.
- Dependencies: an Action's per-result Effects and the Outcome each result answers, and the Definition Type a reference field is limited to, are now dependencies (they could be deleted while in use, and a part exported without them). Deleting a Die can be analysed again ("Unknown object kind: die"), and a Die a Roll throws counts as used there too.
- Contract tests: `tests/contract-completeness.test.mjs` checks that every reference of the shipped Rulesets is a dependency, that every object kind resolves to its collection the same way everywhere, that Formula nodes are in the visual editor (or listed as API-only), that operations, operand kinds, value types and capabilities have their words in both languages, and that export/import and the repair keep current data unchanged.
- Two players acting on the same GM Actor at the same moment (both striking the ogre) both count: the GM client serves relayed writes one after the other, and a client's commits no longer interleave (the second writer of a container used to overwrite the first, both reported as done).
- Combat: the first combatant of a combat or a round hears its turn once, after the start and round events (its turn Triggers ran twice when Foundry signalled the update before the turn change).
- Multi-client tests: `tests/multiclient-foundry.test.mjs` runs a GM and two players, each loading the real module, over a simulated Foundry server (`tests/helpers/foundry-sim`). The `Checks` workflow runs the tests and both audits on every push and pull request.
- Documentation in English, reviewed against the current code (guide, examples and architecture brought up to date): docs/gm-guide.md (was guide-mj.md), docs/configuration-examples.md (was exemples-configuration.md) and docs/architecture.md. docs/recette-foundry-v14.md is removed, and with it the manual Foundry gate of qa/release-readiness.mjs.
- RWF Ruleset 2.6.0: in a pursuit each character keeps its own share of the gap; a pursuer's gap with its target is the sum of both shares (−3 caught, +3 the pursuer lost it). A pursuer's move changes only its own gap; a fugitive's move moves it away from all its pursuers.
- RWF Ruleset 2.5.0: a pursuit gauge is the gap of a fugitive with its pursuers (−3 caught, +3 got away); a pursuer's move (input "sens" −1) narrows its target's gauge. At 0 Endurance a character is exhausted: Incapacité physique, applied automatically, until a long rest.

## 1.0.20

- A Foundry combat flagged `rule-them-all.singlePass` has a single pass per round whatever the Ruleset's passes (for a pursuit or another scene using the combat tracker).

## 1.0.19

- Ruleset extensions: in the part export dialog, **Exporter comme extension** adds a header (name, version, target Ruleset and minimum Ruleset version). **Importer une partie…** installs it: refused for another Ruleset or an older version; an installed extension is updated by its next version (its own entries replaced without asking, dropped ones removed, entries imported as a copy keep their id).
- The Ruleset records installed extensions (`extensions`: entries brought, entries replaced with their previous content, renamed ids). The General section lists them with **Retirer**: what it added is deleted, what it replaced comes back; refused, with the list, while the Ruleset's own entries use what it added. Cards from an extension show its name.
- API: `planExtensionInstall`, `installExtension`, `removeExtension`; `exportRulesetPart` takes `extension: {id, name, version, minVersion}`.

## 1.0.18

- Export part of a Ruleset with what it needs: right-click a card (**Exporter…**), Ctrl+click several cards then **Exporter la sélection**, or right-click a family or a section in the menu. The dialog lists the dependencies by family; unchecked ones are not carried and are expected in the receiving Ruleset. The file format is `rule-them-all-part`.
- **Importer une partie…** (Ruleset header) reads such a file into an editable Ruleset: refused with the list of what is missing when an expected entry is absent; identical entries are skipped; for an entry already there but different, keep yours, replace it, or import the file's as a copy under a new id (the part's references follow it). World translations of the part's texts come along.
- API: `exportRulesetPart`, `listPartDependencies`, `planRulesetPartImport`, `importRulesetPart` on the configurator API.

## 1.0.17

- Ruleset "Combat et ressources partagées": **Vaincu quand** (initiative.defeatedConditionRef), a Condition that marks a combatant defeated in Foundry's combat tracker (and the token's status) while it holds, and clears the mark when it stops holding. The GM's own toggle stays until the Condition changes.
- Combat events: one Trigger in error no longer stops the event for the other Actors, nor the next events of the same change (round, turn); the error is logged in the console.
- RWF Ruleset 2.4.0: defeated at 0 Vitality; each round counted once per character ("Round compté"), so a round announced twice never costs Endurance twice.

## 1.0.16

- Chat cards: a rolled amount (damage, healing) shows the bonus and factor added to its dice and the amount applied, e.g. "1d4 : 4 + 4 = 8", instead of the dice alone.

## 1.0.15

- An Action a player may run reaches its target even when that player does not own it (a player character's attack damages a GM's NPC): writes on the Action's other containers no longer need ownership; the Ruleset's Permissions on what is written still apply. Before, the GM client refused with "Permission denied: write definition …".

## 1.0.14

- Combat start with a Ruleset that rerolls initiative each round: combatants with no initiative yet roll it, and the combat starts on the best one (a combatant made current before the rolls no longer keeps the turn). Initiatives already rolled stay.
- A combat started again begins at the first initiative pass.

## 1.0.13

- Combat: the first combatant of a combat or of a round hears its turn after the start and round events, even when Foundry signals the turn first (the start reset its pass, so it could not attack until the turn was moved back and forth).

## 1.0.12

- Combat: the combatant acting always hears its turn, also when it became the one acting without a turn change (initiative rolled or rerolled, a pass, a combatant removed), once per round, combatant and pass; module events run one batch after the other.
- Chat cards: an Effect that rolls its amount (damage, healing) shows its dice and total.

## 1.0.11

- Combat: when initiative is rerolled at a new round, the turn event goes to the combatant who acts first after the reroll (it went to whoever was first before it, so the real first combatant had no pass and could not attack).
- Sheet editor: a "Description (descriptive scale)" field starts on a Definition that has a scale, its source list only offers those, and each Definition family with scales is also offered as a list of its words.

## 1.0.10

- Sheets: words of a description scale read as prose (they wrap, at the body weight); in a list, they take the free width and the names stay whole.
- Real World Fantasy 2.3.0 in `Rulesets/rwf`: observable states, one description scale per characteristic, skill, mastery and resource, shown in an "États observables" tab and under the health gauges.

## 1.0.9

- An Effect can write a number field of the Content used ("Field of the Content used": a weapon's ammunition), and the next Effects of the Action read what it did in `variables.effects.<id>` (`before`, `after`, `operand`).
- Initiative passes can be counted per combatant by a Formula ("Passes of each combatant"); the combat turn event carries the pass played (`event.payload.pass`).
- Real World Fantasy 2.2.0 in `Rulesets/rwf`: dice announced from the table, passes 1/2/3, ammunition, bursts, full-auto and reload, breathlessness counted on physical rounds and pursuits on foot, catching one's breath.

## 1.0.8

- `game.ruleThemAll.chat.postActionCard(result, versionId, {speaker})`: another module that runs an Action with `runtime.executeAction` posts the same chat card as the sheet.
- Real World Fantasy 2.1.0 in `Rulesets/rwf`: practice outside combat only from a test the GM asks for (the "Demandé par le MJ" checkbox is gone).

## 1.0.7

- Fixed: every Test or Action roll in Foundry failed with "Expected plain JSON data." (the Foundry Roll data kept for the chat card is now copied as plain JSON).
- The repository checks out with LF line endings on every platform; the tests that read templates and stylesheets also accept CRLF.

## 1.0.6

- An Actor made from an Actor Content (a creature dragged from its compendium) takes on its template: its values, states and Actions, and the Item Contents it grants, created as its Items.
- A Content that grants other Contents creates them as Items of the Actor, with the fields the grant sets.
- State rows of an Action can name their state by a Formula; an empty result skips the row.
- Action inputs choosing a Definition say which ones they offer: those held, all, or those not held.
- Distances and nearby counts take a default used when nothing can be measured (no scene, a token missing).
- Critical hits double computed dice counts too: `(@input.level+2)d6` becomes `((@input.level+2)*2)d6`.
- The generic sheet shows an Action a Content grants on that Content's Item instead of the Actor's buttons.
- New ready-made Ruleset in `Rulesets/`: SRD 5.2 (5th edition, 2024 rules), in French.

## 1.0.5

- Creation: a **Choices of the Contents** step asks, on its own screen, the choices of the Contents picked in earlier content steps (the skills a career gives). It is skipped when none of them has a choice.
- Creation: the bonuses and penalties of the steps add up before the values' bounds apply; the character built is bounded once at the end.
- New `Rulesets/` folder with ready-made Rulesets, not shipped in the module zip: Real World Fantasy 2.0.0.

## 1.0.4

- Fix: in 1.0.3 the "Repair the data" menu was refused by Foundry, which stopped the module's initialization (no Repair button, Ruleset sheets and initiative not registered). The menu is now a proper Foundry application.

## 1.0.3

- Game Settings > Rule Them'All > **Repair the data**: after an update, the GM checks the stored Rulesets, sees what will change and repairs them in one click (a backup is downloaded first). No console command needed any more.

## 1.0.2

- Chat cards carry their Foundry rolls and follow the roll mode chosen in the chat (public, GM, blind, self): dice tooltips and Dice So Nice work. A blind card shows players its title only.
- Chat card buttons: an Action can add buttons under its result that run another Action, for the GM, the character's player or each target. That Action reads the first result as `variables.previous`.
- Token bars can show a Ruleset pool with a maximum or a bounded value.
- Configurator: the Rules menu is grouped under headings, Tags moved to Tools, and the Runtime Lab is now "Try the rules".

## 1.0.1

First public release.

- Ruleset configurator, versioned Rulesets with publish, export and import.
- Generic rules engine. It covers dice formulas and custom dice, tests, actions, effects, states and durations. It also handles reactions, choices after a result, rerolls, group actions, initiative and shared resources.
- Character creation window and guided acquisition of Items with choices.
- Progression systems and type-scoped permissions.
- Visual sheet editor for Actors and Items: blocks, layers, templates, card lists, themes saved in the Ruleset, and per-role visibility.
- English and French interface.
