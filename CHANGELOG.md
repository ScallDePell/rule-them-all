# Changelog

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
