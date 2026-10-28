# Rule Them'All

A Foundry VTT v14 module for writing the rules of any tabletop RPG and playing them in any world, whatever game system is installed.

Rule Them'All is a powerful and flexible rule creation module for Foundry Virtual Tabletop.

It allows Game Masters and system creators to design, configure, and manage virtually any type of game rule, from simple mechanics to complex rule systems, without being limited to a predefined ruleset.

Rule Them'All can extend existing Foundry VTT game systems with custom rules and mechanics, or serve as a complete rule-building framework for the Systemless game system.

Whether you want to customize an existing RPG system or build your own rules from scratch, Rule Them'All gives you the freedom to create and shape your gameplay experience.

## What it does

- **Ruleset configurator.** You describe a game's rules as data, without code:
  - definitions: characteristics, skills, resources, tracks;
  - content types: items, talents, spells, careers;
  - rolls, tests, actions, effects, states and durations;
  - creation and progression systems, permissions and tags.
  
  Rulesets are versioned. They can be published, exported and imported between worlds, whole or in part (a rule, a sheet or a section with what it needs).
- **Generic rules engine.** It handles any dice formula and custom dice, success counts, thresholds and margins, and opposed and group tests. It also covers rerolls, choices made after a result, and reactions. Other mechanics include initiative by table or by side, shared world and combat resources, and states that expire on the world clock or on events.
- **Character creation.** A step-by-step window walks players through the configured creation system: allocations, picks and draws.
- **Visual sheet editor.** You build Actor and Item sheets block by block. Blocks include values, gauges, tracks, clocks, card lists, tabs and rich notes. The editor also offers themes, templates and per-role visibility. Each sheet appears in Foundry's sheet selection menu.
- **Open to other modules.** Rule Them'All exposes `game.ruleThemAll`, Foundry hooks, and a `ruleThemAllRegisterTypes` hook for adding value types, formula nodes and effect operations.

The interface is available in English and French.

## Install

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/ScallDePell/Rule-Them-All/releases/latest/download/module.json
```

Enable the module in your world. Then open **Game Settings → Configure Settings → Rule Them'All → Open Rule Them'All**. Only a GM can configure rules.

## Documentation

The documentation is in French for now:

- [GM guide](docs/gm-guide.md): installing, building a Ruleset, publishing it, sheets, character creation and play.
- [Ruleset assistant guide](docs/assistant-guide.md) ([en français](docs/assistant-guide.fr.md)): every assistant path and every question, what it is for and what it builds.
- [Configuration examples](docs/configuration-examples.md), drawn from well-known games.
- [Architecture](docs/architecture.md), for contributors, with the public API other modules may rely on.
- [Contributing](CONTRIBUTING.md): how to make the common changes (a Formula node, an Effect operation, a sheet block, a reference) and which checks to run.

## Exemples de rulesets

Ready-made Rulesets, kept out of the module zip. Download the `.json` file and import it from the Configurator with **Import**.

- [Real World Fantasy 2.6.0](Rulesets/rwf/) ([rwf-ruleset-2.6.0.json](Rulesets/rwf/rwf-ruleset-2.6.0.json)): contemporary fantasy, d20 + characteristic + skill. Character creation, combat, practice-based progression, pursuits, powers and 461 contents. Notes in French.
- [SRD 5.2 1.0.0](Rulesets/srd-5.2/) ([srd-5.2-ruleset-1.0.0.json](Rulesets/srd-5.2/srd-5.2-ruleset-1.0.0.json)): the 5th edition 2024 rules of the System Reference Document 5.2 (CC-BY-4.0). Abilities, d20 tests, conditions, combat, death saves, spellcasting and 339 spells, 12 classes to level 20 with multiclassing, species, backgrounds, feats, equipment, magic items and 341 monsters. No character sheet. Texts and notes in French.

## Development

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs --strict
```

The same checks run on every push and pull request (`.github/workflows/ci.yml`). See [CONTRIBUTING.md](CONTRIBUTING.md).

Pushing a `v*` tag builds the release zip and its `module.json` (see `.github/workflows/release.yml`).

## License

[MIT](LICENSE)
