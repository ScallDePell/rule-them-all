# Changelog

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
