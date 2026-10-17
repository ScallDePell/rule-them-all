# Rule Them'All

A Foundry VTT v14 module for writing the rules of any tabletop RPG and playing them in any world, whatever game system is installed.

Rule Them'All does not replace your game system. It keeps its own data in the flags of Actors and Items, and offers its sheets next to the system's own.

## What it does

- **Ruleset configurator.** You describe a game's rules as data, without code:
  - definitions: characteristics, skills, resources, tracks;
  - content types: items, talents, spells, careers;
  - rolls, tests, actions, effects, states and durations;
  - creation and progression systems, permissions and tags.
  
  Rulesets are versioned. They can be published, exported and imported between worlds.
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

- [GM guide](docs/guide-mj.md): installing, building a Ruleset, publishing it, sheets, character creation and play.
- [Configuration examples](docs/exemples-configuration.md), drawn from well-known games.
- [Architecture](docs/architecture.md), for contributors.

## Updating from an earlier build

Worlds created with a pre-1.0 build may hold data in formats that were since removed. Before upgrading, back up the world. Then, as GM, run this in the browser console:

```js
const {convertWorld} = await import("/modules/rule-them-all/tools/convert-stored-data.mjs");
await convertWorld();               // shows what will change
await convertWorld({write: true});  // downloads a backup, then converts
```

## Development

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs
```

Pushing a `v*` tag builds the release zip and its `module.json` (see `.github/workflows/release.yml`).

## License

[MIT](LICENSE)
