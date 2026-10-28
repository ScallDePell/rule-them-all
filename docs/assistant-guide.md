# Rule Them'All: Ruleset assistant guide

*[Version française](assistant-guide.fr.md)*

The assistant builds a whole rule from a few questions: a list of characteristics, an attack, a state, a rest, a character creation… This guide describes **every path** of the assistant and **every question** it asks: what it is for, its default, when it shows, and what the assistant builds from your answers.

It complements the [GM guide](gm-guide.md), which presents the configurator and the Ruleset's notions (Definitions, Tests, Actions, Effects…).

## Contents

1. [Opening the assistant](#opening)
2. [How it works](#how-it-works)
3. [Kinds of questions](#questions)
4. [The preview and errors](#preview)
5. [The module's events](#events)
6. [Reading the path tables](#tables)
7. The paths:
- **Basics**: [Characteristics](#path-characteristics), [Skills](#path-skills), [Computed value](#path-derivedValue), [Bounds of a value](#path-bounds), [Resource](#path-resource), [Roll or test](#path-test), [Attack](#path-attack), [Condition](#path-state), [Cost](#path-cost), [Consumable](#path-consumable), [Level and experience](#path-level), [Encumbrance](#path-encumbrance)
- **Game systems**: [Advantage and situational bonus](#path-advantage), [Damage types](#path-damageTypes), [Power or spell](#path-power), [Automatic threshold](#path-threshold), [Rest and recovery](#path-rest), [React to a roll of the system](#path-systemRoll), [Initiative](#path-initiative), [Character creation](#path-creation), [Progression](#path-progression), [Descriptive scale](#path-scale), [Content type](#path-contentType), [Permissions](#path-permission)
- **Building blocks**: [Definition type](#path-definitionType), [Value](#path-value), [Parameter](#path-parameter), [Formula](#path-formula), [Condition rule](#path-condition), [Roll](#path-roll), [Test result](#path-outcome), [Duration](#path-duration), [Effect](#path-effect), [Action](#path-action), [Counter](#path-counter), [Trigger](#path-trigger), [Random table](#path-table), [Special die](#path-die)
8. [For other modules](#modules)
9. [Keeping this guide up to date](#maintenance)

<a id="opening"></a>
## 1. Opening the assistant

Open the configurator (the **Rule Them'All** button of the game settings, GM only), choose a Ruleset and a **draft** version, then click **Assistant**, at the top, left of **Import a part…**. On a validated version, the assistant shows the paths but cannot apply anything: create a new version to change it.

The window has three areas:

- **on the left**, the list of paths, in three groups (Basics, Game systems, Building blocks), with a search by word ("attack", "mana", "level"…); each card takes the color of the Ruleset section it fills;
- **in the middle**, the chosen path: its title, what it does, its limits (the ⓘ line), then **Your answers**;
- **at the bottom**, **What the assistant will do**: the preview, and the **Apply** button.

A companion module may add its own panel at the top of the window (for instance a helper that fills the answers for you); it only fills the form, you still apply.

<a id="how-it-works"></a>
## 2. How it works

1. **Choose a path** on the left.
2. **Answer the questions.** They are all on one page; some only show after a given answer (the "Shown when" column of the tables). A question expecting a Ruleset entry (a type, a resource, a test…) offers the existing entries that fit **and** the option **Create: …**, which opens that entry's path questions right there.
3. **Read the preview**, updated at each answer: what will be created, reused, completed, filled in or changed, the errors to fix (under the name of the question at fault) and what will be missing before publishing.
4. **Apply.** Everything is written at once in the draft. Then: open a created entry to adjust it, **Try the rules** to test it in the sandbox, or **Build another rule**.

The rules the assistant always follows:

- **It never removes anything.** It creates entries, adds items to an existing entry's lists (a cost to an Action, a step to a creation, a variant to a Roll) and fills fields still empty (initiative, a value's scale). A field already set is not replaced: the preview says so.
- **It only changes an existing setting in a path made for it**: [Bounds of a value](#path-bounds) replaces the minimum or maximum of a type or of values, and the preview shows "before → after".
- **It reuses rather than doubles**: a Formula, Condition, Roll or Duration identical to an existing entry is reused (except a Formula or Condition you give an id or a description).
- **It does not create Contents** (items, spells, origins): they are created in the configurator or by import.
- **It imposes no game rule**: no die, difficulty or game-specific "default" value; what the questions suggest can be changed.
- Created entries go to the **draft**: they only play in games once the version is **published**.

**Names and ids.** An entry's name is written in the GM's language when they apply; the names the assistant gives itself ("Bonus: Melee", "Apply: Poisoned") are given in each path. A new entry's id is made from its name ("Sword strike" → `sword-strike`), unique in the whole Ruleset. The questions whose id calculations read (Action questions, values read by a Test, fields, creation steps: "with id" in the tables) also have an **Id (optional)** box.

<a id="questions"></a>
## 3. Kinds of questions

| Kind | How to answer |
|---|---|
| Name | A text. With id: a second box for the id (letters, digits, `-` and `_`). |
| Text | Free text. |
| Number, Whole number | A number, within the limits shown ("at least 1"). |
| Yes / no | A checkbox. |
| Choice | A list of options; each option is explained in the path's table. |
| Dice | A Foundry dice formula: `1d20`, `3d6`, `2d20kh` (keep the highest), `4d6kh3`, `1d8+2`. Dice may read the Content used (`@content.field`), the Action's questions (`@input.id`) and special dice by their letter. |
| Formula | A calculation, built with the visual editor (the same as in the configurator). |
| Condition | A true-or-false test, with the same editor. |
| Entry | A Ruleset entry among those that fit (the "What it is for" column says which), or **Create: …** to create one with its own questions, shown in place. |
| Entries | Several existing entries, ticked in a list. |
| List | Rows to add (**Add a row**) or remove (**Remove the row**), each with its own questions (the `list.question` keys of the tables). A list with "at least 1" starts with one row. |
| Event | A module event (see [section 5](#events)) or an Event Type of the Ruleset. |

An **optional** Formula or Condition question has a **Use** box: unticked, it stays empty. An optional Entry question has the option **None**.

**The calculation editor.** Each box of a calculation is an operand or a nested calculation:

- **Literal**: a number, a text, yes or no;
- **Parameter**: a Ruleset setting ([Parameter](#path-parameter));
- **Formula**: a Formula of the Ruleset;
- **Reference**: a value of a Definition (a characteristic's final value, a pool's points, an active state), **read on** self, the target or another role;
- **Context value**: data of the moment, such as `variables.input.<id>` (the answer to an Action's question), `variables.test.margin` (total − difficulty), `variables.test.natural` (the natural die), `variables.test.outcome.resultKey`, `event.payload.<field>` (a field of the event);
- **Content field**: a field of the Content used (a weapon's damage), with a fallback value;
- **Dice of the roll**, **Distance**, **Actors nearby**;
- **Kind of Actor**: true when the Actor is played by a player (PC), is of a Foundry Actor type or holds a Content Type;
- **System data**: data of Foundry's game system (`system.attributes.ac.value` in dnd5e), read on a role;
- **Calculation**: an operation on other boxes (+, −, ×, ÷, min, max, sum, average, roundings, clamp, if…then…else, range table, lookup table, comparisons, and, or, not).

<a id="preview"></a>
## 4. The preview and errors

The preview sorts what applying will do:

- **Created**: the new entries, with their kind (click to open them after applying);
- **Reused**: the existing entries chosen in your answers;
- **Completed**: the lists of an existing entry that get items ("Costs: +1");
- **Filled in**: the empty fields that will be filled;
- **Changed**: the settings replaced, "before → after" (only [Bounds of a value](#path-bounds));
- **To fix**: the errors, with the question concerned; **Apply** stays greyed out while there are any;
- **To complete before publishing**: what the new entries lack for the version to be published (they can be applied anyway, in the draft).

The possible errors:

| Code | Message |
|---|---|
| `MISSING` | Answer required |
| `TYPE` | Invalid answer |
| `RANGE` | Out of range |
| `OPTION` | Unknown choice |
| `DICE` | Invalid dice formula |
| `FORMULA` | Invalid calculation |
| `NOT_FOUND` | Entry not found |
| `NOT_ACCEPTED` | This entry does not fit here |
| `TOO_MANY` | Too many rows |
| `DEPTH` | Too many nested levels |
| `ID_TAKEN` | Id already taken |
| `BUILD` | Cannot build |
| `ADD_TARGET` | Cannot complete this entry |
| `FILL_TARGET` | Cannot fill this field |
| `REPLACE_TARGET` | Cannot change this setting |
| `ALREADY_SET` | Already set: the assistant replaces nothing |
| `INVALID` | The result would not be valid |

If the Ruleset changes between the preview and applying (another window, another GM), the assistant refuses to write and asks to check again.

<a id="events"></a>
## 5. The module's events

Event questions offer these events, then the Ruleset's Event Types:

| Id | Name | Fields (`event.payload.<field>`) |
|---|---|---|
| `rta.combat.start` | Combat starts | `combatId`, `round` |
| `rta.combat.round` | New round | `combatId`, `round` |
| `rta.combat.turn` | Turn starts | `combatId`, `round`, `turn`, `pass` |
| `rta.combat.end` | Combat ends | `combatId`, `round` |
| `rta.time.elapsed` | Time elapsed | `seconds`, `days`, `worldTime` |

<a id="tables"></a>
## 6. Reading the path tables

Each path starts with what it builds and an example, then a table of its questions, in the form's order:

- **Key**: the question's id, the one other modules and error messages use; for a question of a list, `list.question`;
- **Question**: the label shown;
- **Kind**: the [kind of question](#questions), "optional" when it may stay empty, "with id", and its limits;
- **Default**: the answer already filled in ("New …": the **Create** option is chosen with that name);
- **Shown when**: when the question appears, depending on the other answers;
- **What it is for**: its role, and each option of a choice.

## Paths: Basics

<a id="path-characteristics"></a>
### Characteristics (`characteristics`)

**What it builds:** One Definition (capability "number") per characteristic, in the chosen type. With a modifier, also for each one: a Definition “Modifier: *name*” in the modifiers' type, a Formula of the same name computing the modifier, and a formula link making that Formula the modifier's final value.

**Example:** Strength, Dexterity, Constitution… with **(score − 10) ÷ 2, rounded down** gives D&D-style modifiers: 14 → +2, 9 → −1.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `type` | Type of the characteristics | Entry | New Definition type “Characteristic” | always | The Definition Type that holds the characteristics. Pick an existing type that holds a number, or keep “Create: Definition type” to create one here (its "number" capability is imposed). Bounds (minimum, maximum) are set on this type, or later with [Bounds of a value](#path-bounds). |
| `items` | Characteristics | List, at least 1 | — | always | One row per characteristic. Add as many rows as needed; the order of the rows is the order of the cards. |
| `items.name` | Name | Name | — | always | The characteristic's displayed name. Its id (read by Formulas) is made from the name: "Strength" gives `strength`. |
| `modifier` | Modifier | Choice | None | always | **None**: only the scores. **(score − 10) ÷ 2, rounded down**: a computed modifier for each score, (score − 10) ÷ 2 rounded down. For another calculation, create the characteristics without a modifier, then use [Computed value](#path-derivedValue). |
| `modifierType` | Type of the modifiers | Entry | New Definition type “Modifier” | Modifier: (score − 10) ÷ 2, rounded down | The Definition Type of the modifiers created. A new "Modifier" type by default; you may pick an existing type that holds a number. |

<a id="path-skills"></a>
### Skills (`skills`)

**What it builds:** One Definition (number, the rank) per skill in the chosen type, and for each a Formula “Bonus: *name*” computing its roll bonus. That Formula is not bound to anything: a Test uses it when you pick it as its bonus (“Bonus added to the roll” question of [Roll or test](#path-test)).

**Example:** Melee linked to Strength with **Characteristic + rank**: bonus = Strength + Melee rank.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `type` | Type of the skills | Entry | New Definition type “Skill” | always | The skills' Definition Type: an existing type that holds a number, or a new one created here ("Skill" by default). |
| `items` | Skills | List, at least 1 | — | always | One row per skill. |
| `items.name` | Name | Name | — | always | The skill's name; its id is made from the name. |
| `items.linked` | Linked characteristic | Entry, optional | — | always | The characteristic (or any numeric value) added to the rank in the bonus. Leave it empty for a skill that depends on no characteristic: the bonus is then the rank alone. |
| `bonus` | Roll bonus | Choice | Characteristic + rank | always | How the bonus is computed. **Characteristic + rank**: linked value + rank. **Characteristic + rank × factor**: linked value + rank × “Rank factor” (rank × 2, for instance). **Rank only**: the rank only, even when a characteristic is linked. |
| `factor` | Rank factor | Formula | 1 | Roll bonus: Characteristic + rank × factor | The rank's multiplier. A number or a full calculation (a Parameter, the level…), written with the calculation editor. |

<a id="path-derivedValue"></a>
### Computed value (`derivedValue`)

**What it builds:** If the value is new, a Definition (number). Then a Formula holding the calculation (an identical Formula already there is reused) and a formula link making that Formula the Definition's final value: it computes itself.

**Example:** Defense = 10 + Agility; Initiative = Agility + Perception.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `target` | Value | Choice | A new value | always | **A new value**: the assistant creates the value. **An existing value**: the calculation applies to a value already there (a characteristic that must be computed, for instance). |
| `name` | Name | Name | — | Value: A new value | The new value's name. |
| `type` | Type of the value | Entry | New Definition type “Computed value” | Value: A new value | The new value's Definition Type: an existing one (holding a number) or one created here ("Computed value" by default). |
| `existing` | Existing value | Entry | — | Value: An existing value | The existing value that receives the calculation. A value that already has a formula link keeps its first calculation: check it in the editor. |
| `expression` | Calculation | Formula | — | always | The calculation, built with the visual editor: numbers, Parameters, references to other values (Reference), Formulas, operations (+, −, ×, ÷, min, max, if…). |
| `binding` | Name of the computing link (optional) | Name, optional | — | always | Optional: the name of the formula link. Without one, the link takes the value's name. Only useful to find that link under a given name in the configurator. |

<a id="path-bounds"></a>
### Bounds of a value (`bounds`)

**What it builds:** Nothing new, except a Formula “Maximum: *name*” (or “Minimum: *name*”) when the bound is a calculation. It is the only path that **changes an existing setting**: it replaces the minimum or maximum (`valueBounds`) of the chosen type or values. The preview shows it as "before → after".

**Example:** Characteristics capped at 5 for player characters only: **Every value of a type** "Characteristic", **Maximum**, “New bound” 5, “Only when (otherwise the current bound stays)” "Kind of Actor: played by a player (PC)". NPCs keep the old maximum.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `target` | What is bounded | Choice | Every value of a type | always | **Every value of a type**: the bound applies to every value of the type (all characteristics). **Some values**: only the chosen values, which then get their own bound, taking precedence over the type's. |
| `type` | Type of values | Entry | — | What is bounded: Every value of a type | The Definition Type (holding a number) whose bound changes. |
| `definitions` | Values | Entries, at least 1 | — | What is bounded: Some values | The values (one or more) whose bound changes. |
| `bound` | Bound | Choice | Maximum | always | **Maximum** or **Minimum**: the bound replaced. To set both, apply the path twice. |
| `value` | New bound | Formula | — | always | The new bound: a number, or a calculation (a Parameter, level × 2…). A number is stored as it is; a calculation becomes a Formula. |
| `when` | Only when (otherwise the current bound stays) | Condition, optional | — | always | Optional: a Condition. When given, the new bound applies only while it is true, and the old bound (the value's own, else its type's, else none) stays for every other case. The "Kind of Actor" operand targets player characters, an Actor type or a Content Type. |

<a id="path-resource"></a>
### Resource (`resource`)

**What it builds:** A Definition with a gauge (capability "pool", slot `points`): minimum, maximum, starting value. When the maximum is a calculation, a Formula “Maximum: *name*”.

**Example:** Maximum hit points = 10 + Constitution × 2, whole numbers, full at the start.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The resource's name (Hit points, Mana, Ammunition…). |
| `type` | Type of the resource | Entry | New Definition type “Resource” | always | The Definition Type: an existing type holding a pool, or a new one ("Resource" by default). |
| `maximum` | Maximum | Choice | A number | always | **A number**: a constant maximum, given in the next question. **A calculation**: a computed maximum (a characteristic, the level…). |
| `maxValue` | Maximum | Number | — | Maximum: A number | The constant maximum. |
| `maxFormula` | Maximum calculation | Formula | — | Maximum: A calculation | The maximum's calculation, with the visual editor. |
| `minimum` | Minimum | Number | 0 | always | The lowest value of the gauge (0 most often; negative for hit points that go below zero). |
| `initial` | At the start | Choice | Full | always | **Full**: the gauge starts at its maximum (hit points). **Empty**: it starts at its minimum (fatigue, stress, corruption). |
| `integer` | Whole numbers only | Yes / no | Yes | always | Ticked: the gauge only takes whole numbers. Untick it to allow decimals. |
| `scale` | Description scale (optional) | Entry, optional | — | always | Optional: a description scale ([Descriptive scale](#path-scale)) that shows words (Unhurt, Wounded…) instead of the number to those who cannot see the value. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the help text shown with the resource. |

<a id="path-test"></a>
### Roll or test (`test`)

**What it builds:** A Test, its Roll (an identical Roll already there is reused, else one named after the dice), its Formulas (bonus “Bonus: *name*”, difficulty “Difficulty: *name*”), its Outcomes (“Success”, “Failure”, “Critical”, “Fumble”, named "Name: Success"… with their Conditions) and, when asked, an Action “Roll: *name*” that rolls the test from the sheet.

**Example:** Skill check: 1d20 + "Bonus: Melee", difficulty asked at each roll, critical on a natural 20, fumble on a 1.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The test's name. |
| `roll` | Existing roll (else dice) | Entry, optional | — | always | Optional: an existing Roll (with its variants, an advantage for instance). Leave it empty to simply give dice. |
| `dice` | Dice rolled | Dice | — | depends on “Existing roll (else dice)” | The dice rolled, in Foundry notation: `1d20`, `3d6`, `1d100`, `2d6kh1`… Shown when no “Existing roll (else dice)” is chosen. |
| `bonus` | Bonus added to the roll | Formula, optional | — | always | Optional: a bonus added to the dice total, for instance the Formula "Bonus: Melee" created by [Skills](#path-skills), or a value. |
| `target` | Difficulty | Choice | Asked on each roll | always | What the total is compared with. **Asked on each roll**: the player types the difficulty at each roll (the Action gets a "Difficulty" question). **A fixed number**: always the same number. **A calculation (the target's defense…)**: a calculation, often a value of the target (its Defense). **The target's opposed roll**: the target makes another Test and its total is the difficulty. **None (only the total matters)**: no difficulty, only the total counts (initiative, damage). |
| `targetValue` | Difficulty | Number | — | Difficulty: A fixed number | The fixed difficulty. |
| `askedDefault` | Suggested difficulty | Number, optional | — | Difficulty: Asked on each roll | Optional: the difficulty suggested in the question asked to the player. |
| `targetFormula` | Difficulty calculation | Formula | — | Difficulty: A calculation (the target's defense…) | The difficulty's calculation. To read a value of the target, use a Reference "read on: the target". |
| `opposed` | Opposed roll | Entry | — | Difficulty: The target's opposed roll | The Test made by the target; it must not be opposed itself. |
| `inputs` | Values read before rolling | List, optional | — | always | Optional: values the Test reads before rolling, available to its calculations as the Context value `variables.test.inputs.<id>`. |
| `inputs.name` | Name | Name, with id | — | always | The value's name; the optional id is the one calculations read (else made from the name). |
| `inputs.valueType` | Kind of value | Choice | Number | always | The kind of value: **Number**, **Whole number**, **Yes or no**, **Text** or **A Definition** (a Definition, such as the skill chosen). |
| `inputs.from` | Taken from | Choice | A calculation | always | Where the value comes from: **A calculation**, **A Definition** (a reference to a Definition) or **A fixed value** (a fixed value). |
| `inputs.formula` | Calculation | Formula | — | Taken from: A calculation | The calculation giving the value; it becomes a Formula. |
| `inputs.definition` | Definition | Entry | — | Taken from: A Definition | The Definition passed to the Test. |
| `inputs.value` | Value | Text | — | Taken from: A fixed value | The fixed value, typed as text (`3`, `true`, `fire`) and converted according to “Kind of value”. |
| `inputs.default` | Proposed value (optional) | Text, optional | — | Kind of value: Number, Whole number, Yes or no or Text | Optional: the value used when the source gives nothing. |
| `inputs.required` | Required | Yes / no | Yes | always | Ticked: the Test fails with a message when the value is missing. |
| `outcomes` | Existing results, in order (else created here) | Entries, optional | — | always | Optional: Outcomes already created (with [Test result](#path-outcome)), tried in order; the first whose Condition holds wins. When you choose some, the assistant creates no Success / Failure / criticals. |
| `fallback` | Result when none applies | Entry, optional | — | depends on “Existing results, in order (else created here)” | The Outcome kept when none of the “Existing results, in order (else created here)” applies. Shown when existing outcomes are chosen. |
| `success` | Succeeds when the total is | Choice | Equal to or above the difficulty | depends on “Difficulty” and “Existing results, in order (else created here)” | When the test succeeds, comparing the total with the difficulty (margin = total − difficulty): **Equal to or above the difficulty**, **Above the difficulty**, **Equal to or below the difficulty** (roll-under systems, Call of Cthulhu style), **Below the difficulty**. Shown when there is a difficulty and no existing outcomes. |
| `critical` | Critical on a natural roll of | Whole number, optional | — | depends on “Existing results, in order (else created here)” | Optional: the natural die value (before bonuses) giving a critical success, such as 20. The "Critical" Outcome comes before success. Shown without existing outcomes. |
| `criticalCompare` | Critical when the die shows | Choice | This number or more | depends on “Critical on a natural roll of” | **This number or more** (19-20 with 19) or **This number or less** (roll-under). Shown when “Critical on a natural roll of” is filled. |
| `fumble` | Fumble on a natural roll of | Whole number, optional | — | depends on “Existing results, in order (else created here)” | Optional: the natural die value giving a fumble, such as 1. |
| `fumbleCompare` | Fumble when the die shows | Choice | This number or less | depends on “Fumble on a natural roll of” | **This number or less** (1 with 1) or **This number or more** (96-100 with 96 on a d100). |
| `action` | Add a button to make this roll | Yes / no | Yes | always | Ticked: an Action “Roll: *name*” rolls this test from the sheet (and asks the difficulty when it is asked). Untick it for a test only used by other rules (an attack, initiative). |
| `description` | Description (optional) | Text, optional | — | always | Optional: the test's help text. |

<a id="path-attack"></a>
### Attack (`attack`)

**What it builds:** An attack Action: it rolls the attack test and then, on each outcome that hits, an Effect “Damage: *name*” takes the damage from the target's resource. The damage dice become a Roll “Dice: *name*”; the bonus a Formula; the doubling on a critical the Formula “Critical multiplier” (2 on a "critical" outcome, else 1), which doubles the number of dice. When the test is created here, it has no button of its own.

**Example:** Sword strike: 1d20 + bonus against the target's Defense, 1d8 + 2 damage to Vitality, doubled on a critical.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The attack's name (its button on the sheet). |
| `test` | Roll to hit | Entry | New Roll or test “Attack” | always | The attack test: an existing Test, or a new one created here with the questions of [Roll or test](#path-test) (a computed difficulty and no button of its own, by default). |
| `hits` | Results that hit | Entries, optional | — | depends on “Roll to hit” | Optional, with an existing Test: the Outcomes that deal damage. Empty: all its outcomes except those whose key is `failure` or `fumble`. |
| `damage` | Damage dice | Dice | — | always | The damage dice (`1d8`, `2d6`…). They may read the Content used (`@content.damage`) and the Action's questions (`@input.id`). |
| `damageBonus` | Damage bonus | Formula, optional | — | always | Optional: a bonus added to the dice (Strength, a number). |
| `damageTarget` | Resource that takes the damage | Entry | — | always | The target's resource (a pool) that loses the damage, such as Hit points. You may create it here ([Resource](#path-resource)). |
| `criticalDouble` | Double the dice on a critical | Yes / no | Yes | always | Ticked: on an outcome whose key is `critical`, the number of dice is doubled (2d8 instead of 1d8; the bonus is not doubled). |
| `factor` | Damage factor (resistance…) | Entry, optional | — | always | Optional: a Formula multiplying the damage after the bonus, rounded down: for instance "Damage factor: Fire" created by [Damage types](#path-damageTypes) (0 immune, ½ resistant, 2 vulnerable). |
| `minimum` | Minimum damage | Number | 0 | always | The damage never goes below this number (0 keeps a penalty from healing). |

<a id="path-state"></a>
### Condition (`state`)

**What it builds:** A "state" Definition (active or not). With effects on values: a Condition “*name* active” and one Modifier “*name*: *value*” per row, applying only while the state is active, however it was applied. With changes of the system: Foundry Active Effects managed by the module. Depending on the boxes: an Action “Apply: *name*” (with a Duration, reused when an identical Duration exists) and an Action “Remove: *name*”.

**Example:** Poisoned: 3 rounds, −2 Strength while it lasts, applied to the target.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The state's name (Poisoned, Stunned, Blessed…). |
| `type` | Type of the condition | Entry | New Definition type “Condition” | always | The Definition Type: an existing type holding a state, or a new one ("Condition" by default). |
| `duration` | Duration | Choice | Until removed | always | How long the state lasts when the Action “Apply: *name*” applies it: **Until removed**, **Rounds**, **Turns**, **Minutes**, **Hours**, **Days** (world time), or **Until an event**. |
| `amount` | How many | Whole number, at least 1 | 1 | Duration: Rounds, Turns, Minutes, Hours or Days | The number of rounds, turns, minutes, hours or days. |
| `event` | Event that removes it | Event | — | Duration: Until an event | The event that ends the state: a module event (combat ends…) or an Event Type of the Ruleset. |
| `stacking` | If already present | Choice | Restart its duration | always | When the state is already there as it is applied: **Restart its duration** (the duration starts over), **Stack** (one more stack), **Add a separate copy** (a second copy with its own duration), **Do nothing**. |
| `modifiers` | Effects on values while it lasts | List, optional | — | always | Optional: values changed while the state is active. |
| `modifiers.target` | Value | Entry | — | always | The numeric value changed (its final value). |
| `modifiers.operation` | Change | Choice | Subtract | always | **Subtract**, **Add**, **Multiply by**, **Set to**, **Cap at** (the value does not go above this number), **At least** (the value does not go below this number). |
| `modifiers.amount` | By how much | Formula | 1 | always | The number or calculation of the change. |
| `systemChanges` | Changes of the game system's data while it lasts | List, optional | — | always | Optional: data of Foundry's game system (dnd5e, pf2e…) changed while the state is active, through Active Effects the module creates and removes itself. |
| `systemChanges.key` | Data path (system.abilities.str.value) | Text | — | always | The data path in the system's Actor, such as `system.abilities.str.value` (Strength in dnd5e). A row without a path is ignored. |
| `systemChanges.type` | Mode | Choice | Add | always | The Active Effect mode: **Add**, **Multiply**, **Replace**, **Raise to at least** (the data is at least the value), **Lower to at most** (at most the value). |
| `systemChanges.value` | Value | Text | — | always | The value applied; a number is stored as a number, else as text. |
| `role` | Who it affects | Choice | The target | always | Who gets and loses the state with the Actions created: **The target** or **Oneself**. |
| `applyAction` | Add a button to apply it | Yes / no | Yes | always | Ticked: an Action “Apply: *name*” applies the state with the chosen duration and stacking. |
| `removeAction` | Add a button to remove it | Yes / no | Yes | always | Ticked: an Action “Remove: *name*” removes the state. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the state's help text. |

<a id="path-cost"></a>
### Cost (`cost`)

**What it builds:** An Effect “Spend *n*: *name*” (takes the amount from the acting character's resource), added to the Action's costs; when the Action is refused without enough of the resource, a Condition “Enough *name* (*n*)” added to its conditions. The existing Action is completed; nothing it already does changes.

**Example:** A bow shot costing 1 Ammunition, refused when the quiver is empty.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `action` | Action that costs | Entry | — | always | The Action that costs: an existing Action, or a new one created here with [Action](#path-action). |
| `resource` | Resource spent | Entry | — | always | The resource (a pool) spent by the acting character: an existing one or one created here with [Resource](#path-resource). |
| `amount` | How much | Number, at least 0 | 1 | always | The amount spent at each use. |
| `required` | Refuse the Action when not enough is left | Yes / no | Yes | always | Ticked: the Action is not possible while the resource is below the amount. Unticked: it stays possible and the resource goes down to its minimum. |

<a id="path-consumable"></a>
### Consumable (`consumable`)

**What it builds:** A pool Definition (slot `doses`, from 0 to the number of doses, full at the start), a Condition “Dose left: *name*”, an Effect “One dose: *name*” (−1 dose), an Effect “Effect: *name*” on the chosen value, and an Action “Use: *name*” bringing it together: possible only while a dose is left, it takes one dose and applies the effect to whoever uses it.

**Example:** Healing potion, 3 doses: each use adds 2d4 + 2 to Hit points.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The consumable's name. |
| `type` | Type of the consumable | Entry | New Definition type “Consumable” | always | The Definition Type: an existing type holding a pool, or a new one ("Consumable" by default). |
| `doses` | Doses | Whole number, at least 1 | — | always | The number of doses (or charges) at the start, which is also the maximum. |
| `effectTarget` | Value changed by a use | Entry | — | always | The value changed by a use, on whoever uses it: a pool (its points), a value (its base); you may create a resource here. |
| `operation` | Change | Choice | Add | always | **Add** (healing, recharge), **Subtract**, or **Set to**. |
| `amount` | By how much | Formula | — | always | The amount: a number or a calculation. For dice, use the "Dice of the roll" operand of the calculation editor or an Effect made with [Effect](#path-effect). |

<a id="path-level"></a>
### Level and experience (`level`)

**What it builds:** A level Definition (number) whose final value is computed by a Formula from experience (formula link). When experience is created here, an "Experience" Definition. With the button: an Effect and an Action “Gain: *name*” asking an amount (“Amount”) and adding it to experience.

**Example:** One level every 1000 XP: 0-999 → level 1, 1000-1999 → level 2… Or a table 0 → 1, 300 → 2, 900 → 3.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | Level | always | The level's name ("Level" by default). |
| `type` | Type of the level | Entry | New Definition type “Progress” | always | The level's Definition Type: an existing one (holding a number) or one created here ("Progress" by default). |
| `experience` | Experience | Entry | New Value “Experience” | always | The experience value that raises the level: an existing one or one created here ("Experience" by default, with [Value](#path-value)). |
| `rule` | Rule | Choice | One level every N points | always | **One level every N points**: level = floor(XP ÷ N) + 1. **A table of thresholds**: the highest threshold reached gives the level. |
| `perLevel` | Points per level | Number, at least 1 | — | Rule: One level every N points | The experience points per level (N). |
| `thresholds` | Thresholds | List, at least 1 | — | Rule: A table of thresholds | The table's thresholds, one row per level, in any order. |
| `thresholds.level` | Level | Whole number | — | always | The level reached. |
| `thresholds.experience` | Experience needed | Number | — | always | The experience required for that level. Below the lowest threshold, the level is the lowest threshold's. |
| `award` | Add a button to award experience | Yes / no | Yes | always | Ticked: an Action “Gain: *name*” to give experience from the sheet. |

<a id="path-encumbrance"></a>
### Encumbrance (`encumbrance`)

**What it builds:** A Formula “Carrying capacity” and a Condition (named “Overloaded” by default) true when the load is strictly above the capacity. When the load is created here, a "Load" Definition. Penalties come next: a [Condition](#path-state), an [Advantage and situational bonus](#path-advantage) or Modifiers using that Condition.

**Example:** Overloaded when Load is above Strength × 5.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | Overloaded | always | The Condition's name. |
| `load` | Load carried | Entry | New Value “Load” | always | The value measuring what is carried: an existing one or one created here ("Load" by default). |
| `capacity` | Capacity calculation | Formula | — | always | The carrying capacity's calculation (Strength × 5, a Parameter…). |

## Paths: Game systems

<a id="path-advantage"></a>
### Advantage and situational bonus (`advantage`)

**What it builds:** Nothing new, except sometimes a Roll. For **Advantage (other dice)** or **Disadvantage (other dice)**, a variant is added to each test's Roll: while the Condition holds, that Roll throws the other dice (careful: a Roll shared by other tests changes for them too). For **An extra die**, **A flat bonus** or **A flat penalty**, each test gets an "extra roll" added to its total (or taken from it for a penalty) while the Condition holds.

**Example:** D&D-style advantage: while "Hidden" holds, the attack test rolls `2d20kh` instead of `1d20`. Situational bonus: +2 while the target is prone.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `tests` | Tests affected | Entries, at least 1 | — | always | The tests concerned (at least one). |
| `when` | When | Entry | — | always | The Condition that brings the effect: an existing one or one created here with [Condition rule](#path-condition). |
| `effect` | Effect | Choice | Advantage (other dice) | always | **Advantage (other dice)** and **Disadvantage (other dice)**: other dice instead of the base dice (you write which). **An extra die**: a die added to the total (`1d4` of an inspiration). **A flat bonus** / **A flat penalty**: a number added or taken away. |
| `dice` | Dice rolled instead | Dice | — | Effect: Advantage (other dice) or Disadvantage (other dice) | The dice rolled instead while the Condition holds, such as `2d20kh` (keep the highest) for advantage, `2d20kl` for disadvantage. |
| `extraDice` | Die added | Dice | — | Effect: An extra die | The die added to the total, such as `1d6`. |
| `amount` | Value | Whole number, at least 1 | — | Effect: A flat bonus or A flat penalty | The bonus or penalty, a positive whole number (its direction comes from “Effect”). |

<a id="path-damageTypes"></a>
### Damage types (`damageTypes`)

**What it builds:** For each damage type, the ticked states (“Immunity: *name*”, “Resistance: *name*”, “Vulnerability: *name*”) in the chosen type, and a Formula “Damage factor: *name*” read on the target: 0 when immune, ½ when resistant (and not vulnerable), 2 when vulnerable (and not resistant), else 1. An attack applies that factor when you pick it as “Damage factor (resistance…)” ([Attack](#path-attack)).

**Example:** Fire, Cold, Poison: a monster with "Resistance: Fire" takes only half the damage of a fire attack.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `type` | Type of the resistances | Entry | New Definition type “Damage resistance” | always | The Definition Type of the states created: an existing one (holding a state) or a new one ("Damage resistance" by default). |
| `types` | Damage types | List, at least 1 | — | always | One row per damage type. |
| `types.name` | Name | Name | — | always | The damage type's name (Fire, Cold…). |
| `immunity` | Immunity (no damage) | Yes / no | Yes | always | Ticked: creates the state “Immunity: *name*” (factor 0). |
| `resistance` | Resistance (half) | Yes / no | Yes | always | Ticked: creates the state “Resistance: *name*” (factor ½, rounded down). |
| `vulnerability` | Vulnerability (double) | Yes / no | Yes | always | Ticked: creates the state “Vulnerability: *name*” (factor 2). Resistance and vulnerability together cancel out. |

<a id="path-power"></a>
### Power or spell (`power`)

**What it builds:** An Action named after the power. Depending on “How it works”: an Effect “Effect: *name*” (dice rolled on the resource hit), for a saving throw an Effect “Half: *name*” (half, Formula “Half”), or applying a state with its Duration. With a chosen level, a question “Level” asked at use, read in the dice as `@input.level`. With a cost, an Effect “Spend *n*: *name*” and a Condition “Enough *name* (*n*)”.

**Example:** Fireball: saving throw, 8d6 on the target's Hit points, half on a miss, 1 spell slot spent, cast at level 3 to 9 (`(@input.level + 5)d6`).

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The power's name (its button on the sheet). |
| `resolution` | How it works | Choice | Attack roll | always | How the power works. **Attack roll**: a Test, the effect's dice on the outcomes that hit, doubled on a critical. **Target's saving throw**: a Test seen from the power's side (its success means the target takes it all), the full effect on its hitting outcomes, half otherwise when “Half damage on a failure” is ticked. **Automatic damage**: damage without a roll. **Healing**: the dice added to the resource. **Applies a condition**: a state applied. **Other (no numeric effect)**: no numeric effect (an Action to complete in the editor). |
| `test` | Roll | Entry | — | How it works: Attack roll or Target's saving throw | The Test (attack or save): an existing one or one created here with [Roll or test](#path-test). |
| `hits` | Results that hit | Entries, optional | — | depends on “How it works” and “Roll” | Optional, with an existing Test: the Outcomes giving the full effect. Empty: all but `failure` and `fumble`. |
| `dice` | Effect dice | Dice | — | How it works: Attack roll, Target's saving throw, Automatic damage or Healing | The effect's dice (`8d6`, `1d8 + 3`). They may read the chosen level (`@input.level`) and the Content used (`@content.field`). |
| `target` | Resource affected | Entry | — | How it works: Attack roll, Target's saving throw, Automatic damage or Healing | The resource (pool) hit: an existing one or one created here with [Resource](#path-resource). |
| `halfOnMiss` | Half damage on a failure | Yes / no | Yes | How it works: Target's saving throw | Ticked: on an outcome that does not hit, half the dice (rounded down). |
| `state` | Condition applied | Entry | — | How it works: Applies a condition | The state applied: an existing one or one created here with [Condition](#path-state). |
| `duration` | Duration | Choice | Rounds | How it works: Applies a condition | The state's duration: **Until removed**, **Rounds**, **Turns**, **Minutes**, **Hours**, **Days** or **Until an event**. An identical Duration already there is reused. |
| `amount` | How many | Whole number, at least 1 | 1 | How it works: Applies a condition and Duration: Rounds, Turns, Minutes, Hours or Days | The number of rounds, turns, minutes, hours or days. |
| `event` | Event that removes it | Event | — | How it works: Applies a condition and Duration: Until an event | The event that ends the state. |
| `role` | Who it affects | Choice | The target | always | Who the effect or state is for: **The target** or **Oneself** (healing oneself, a personal blessing). |
| `levels` | Cast at a chosen level | Yes / no | No | always | Ticked: the player chooses the level the power is cast at (a list from “Lowest level” to “Highest level”). |
| `levelMin` | Lowest level | Whole number | 1 | Cast at a chosen level: Yes | The lowest level offered (also the default). |
| `levelMax` | Highest level | Whole number | — | Cast at a chosen level: Yes | The highest level offered. |
| `cost` | Resource spent | Entry, optional | — | always | Optional: the resource spent by the caster (mana, slots); an existing one or one created here. The power is refused when not enough is left. |
| `costAmount` | Cost | Number, at least 0 | 1 | depends on “Resource spent” | The amount spent at each cast. |

<a id="path-threshold"></a>
### Automatic threshold (`threshold`)

**What it builds:** A Condition (the threshold reached), an Action “Apply: *name*” applying the state to whoever crosses the threshold (without stacking), with removal a Condition “Over: *name*” and an Action “Remove: *name*”, and a Trigger “Check: *name*” running those Actions at the chosen event. With “Count as defeated for initiative”, the Condition is stored as initiative's "defeated" condition.

**Example:** Unconscious when Vitality is at most 0, checked at each turn start, removed when it goes back up.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The threshold Condition's name. |
| `watched` | Value watched | Entry | — | always | The watched value: a pool (its points), a value (its final value) or a state (active or not). |
| `compare` | When it is | Choice | At most | always | The threshold's direction: **At most**, **Below**, **At least**, **Above**, **Equal to**. |
| `limit` | Threshold | Number | 0 | always | The number the watched value is compared with. |
| `state` | Condition applied | Entry | — | always | The state applied when the threshold is reached: an existing one or one created here with [Condition](#path-state). |
| `event` | Check on | Event | `rta.combat.turn` | always | When the threshold is checked: `rta.combat.turn` (turn starts) by default, or another module or Ruleset event. |
| `remove` | Remove the condition when the threshold is no longer met | Yes / no | Yes | always | Ticked: the state is removed, at the same check, once the threshold is no longer reached. |
| `defeated` | Count as defeated for initiative | Yes / no | No | always | Ticked: the Condition becomes initiative's "defeated" condition: the combatant is marked defeated in the combat tracker while it holds. It needs an initiative already set ([Initiative](#path-initiative)) whose "defeated" is still empty; otherwise the preview shows the error. |

<a id="path-rest"></a>
### Rest and recovery (`rest`)

**What it builds:** One Effect “Recover: *name*” per recovered resource (on whoever rests) and the removal of the chosen states, in a new Action ("Rest" by default) or added to an existing rest Action. With “Also each game day, by itself”: a Trigger “Each day: *name*” on time passing (`rta.time.elapsed`) and a Condition “A day has passed”, which run the rest each time at least one midnight passes in the world.

**Example:** Long rest: Hit points back to maximum, Fatigue reset to 0, Exhausted removed, each game day.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `mode` | Rest | Choice | A new rest | always | **A new rest**: creates the rest Action. **Complete an existing rest**: adds recoveries and removed states to an Action already there, changing nothing else. |
| `name` | Name | Name | Rest | Rest: A new rest | The new rest's name. |
| `action` | Existing rest | Entry | — | Rest: Complete an existing rest | The rest Action to complete. |
| `resources` | What is recovered | List, at least 1 | — | always | One row per value recovered. |
| `resources.resource` | Resource | Entry | — | always | The value recovered: a pool or a value. |
| `resources.recovery` | Recovery | Choice | All of it | always | **All of it**: the pool goes back to its maximum (pools only). **A number**: adds a number. **A calculation**: adds a calculation (level + Constitution). **Reset to**: sets the value (fatigue to 0). |
| `resources.amount` | How much | Number | 1 | Recovery: A number | The number added. |
| `resources.expression` | Calculation | Formula | — | Recovery: A calculation | The calculation added. |
| `resources.resetTo` | Value | Number | 0 | Recovery: Reset to | The value set. |
| `clearStates` | Conditions cleared | Entries, optional | — | always | Optional: the states the rest removes. |
| `daily` | Also each game day, by itself | Yes / no | No | always | Ticked: the rest also happens by itself each game day (when the world clock passes midnight). |

<a id="path-systemRoll"></a>
### React to a roll of the system (`systemRoll`)

**What it builds:** An Event Type following a Foundry hook of the game system (its fields `total` and `item` when their paths are given), a Condition “*name*: success” (only for the item named, only when the total reaches the mark) and a Trigger “On *name*” running the Actions, automatically, for the acting Actor. The player's targets in Foundry become the Actions' targets.

**Example:** A dnd5e weapon "Vampire blade" applying "Weakened" on a hit: hook `dnd5e.rollAttack`, Actor `1.subject`, total `0.0.total`, item `1.subject.item`, item named "Vampire blade", total ≥ the target's AC (System data `system.attributes.ac.value` read on the target), Action "Apply: Weakened".

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name of the event | Name | System roll | always | The Event Type's name ("System roll" by default). |
| `hook` | Foundry hook (dnd5e.rollAttack) | Text | — | always | The name of the Foundry hook listened to, as the system declares it: `dnd5e.rollAttack`, `dnd5e.rollDamage`, `pf2e…`. See the system's documentation. |
| `who` | Heard on | Choice | The client where it happens (rolls) | always | **The client where it happens (rolls)**: the event starts from the client where the hook happens (the rolling player's). **The active GM's client only**: only from the active GM's client (for a hook that happens on every client). |
| `selfPath` | Acting Actor, path (1.subject) | Text, optional | — | always | Optional: where the acting Actor is read in the hook's arguments, numbered from 0. For `dnd5e.rollAttack`: `1.subject`. Empty: the Actor is unknown and the Trigger applies to nobody. |
| `totalPath` | Roll total, path (0.0.total) | Text, optional | — | always | Optional: where the roll's total is read, such as `0.0.total` (first argument, first roll, total). Fill it in to give “Only if the total reaches (the target's AC: System data)”. |
| `itemPath` | Item used, path (1.subject.item) | Text, optional | — | always | Optional: where the item used is read, such as `1.subject.item`. The module keeps its name. Fill it in to give “Only for the item named”. |
| `item` | Only for the item named | Text, optional | — | depends on “Item used, path (1.subject.item)” | Optional: the Trigger only applies to the item of this exact name. |
| `reach` | Only if the total reaches (the target's AC: System data) | Formula, optional | — | depends on “Roll total, path (0.0.total)” | Optional: the Trigger only applies when the total is at least this calculation, such as the target's armor class with the "System data" operand read on the target. |
| `actions` | Actions run | Entries, at least 1 | — | always | The Actions run (at least one), such as "Apply: Weakened" created with [Condition](#path-state). |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Event Type's help text. |

<a id="path-initiative"></a>
### Initiative (`initiative`)

**What it builds:** Nothing in the lists: the path fills the Ruleset's initiative (Ruleset form, "Combat and shared resources" block), only while it is still empty. With a tie-break or passes, Formulas “Initiative tie-break” and “Initiative passes”. To change an existing initiative, use the Ruleset form.

**Example:** Initiative 1d20 + Agility, ties broken by Perception, rerolled each round.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `test` | Initiative roll | Entry | New Roll or test “Initiative” | always | The Test whose total gives the initiative: an existing one, or one created here ("Initiative" without a difficulty or a button, by default). |
| `eachRound` | Reroll each round | Yes / no | No | always | Ticked: initiative is rerolled at the start of each round. |
| `tieBreak` | Tie-break | Formula, optional | — | always | Optional: a calculation that breaks ties (highest goes first). |
| `passes` | Passes per round | Formula, optional | — | always | Optional: the number of passes of each combatant per round (as many passes as attacks, for instance). The "Turn starts" event gives the current pass in `event.payload.pass`. Passes "while above a threshold" (Shadowrun) are set in the Ruleset form. |
| `defeated` | Defeated when | Entry, optional | — | always | Optional: the Condition that makes a combatant defeated: while it holds for their Actor, they are marked defeated in the combat tracker (with the status on their token). An existing one or one created here. |
| `bySide` | Play by side | Yes / no | No | always | Ticked: one roll per side; every combatant of a side takes the result of the first one who rolls. |

<a id="path-creation"></a>
### Character creation (`creation`)

**What it builds:** A Creation System ("Character creation" by default) with its steps, or new steps added at the end of an existing creation. Computed minimums and maximums become Formulas “Minimum: *name*”, “Maximum: *name*”, “Maximum per value: *name*”. The Contents (origins, classes…) must already exist: they are created in the configurator or by import.

**Example:** Choose an Origin, then its choices, then share 10 points among the characteristics (at most 3 per characteristic), then review.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `mode` | Creation | Choice | A new creation | always | **A new creation**: a new creation. **Add steps to a creation**: adds steps at the end of a creation already there, leaving the others alone. |
| `name` | Name | Name | Character creation | Creation: A new creation | The new creation's name. |
| `system` | Existing creation | Entry | — | Creation: Add steps to a creation | The creation to complete. |
| `steps` | Steps | List, at least 1 | — | always | One row per step, in the order the player follows them. |
| `steps.kind` | Kind of step | Choice | Pick contents | always | **Pick contents**: take Contents among those offered (an origin, a class). **Choices of the contents picked before**: make the choices of the Contents taken at earlier steps (a class's spells, an origin's skills). **Spend points**: share points among values. **Choose values**: choose values from a list. **Final review**: a final check before the character is created. |
| `steps.name` | Name | Name, with id | — | always | The step's name; the optional id is otherwise made from the name. |
| `steps.templates` | Contents offered | Entries, at least 1 | — | Kind of step: Pick contents | The Contents offered at this step (at least one). |
| `steps.definitions` | Values | Entries, at least 1 | — | Kind of step: Spend points or Choose values | The values offered or receiving the points (at least one). |
| `steps.min` | At least | Whole number, at least 0 | 1 | Kind of step: Pick contents, Spend points or Choose values | The minimum: number of Contents or values to take, or of points to share. |
| `steps.max` | At most | Whole number, at least 0 | 1 | Kind of step: Pick contents, Spend points or Choose values | The maximum, in the same sense. |
| `steps.minFormula` | Computed minimum (optional) | Formula, optional | — | Kind of step: Pick contents, Spend points or Choose values | Optional: a computed minimum replacing the number (from the level, Intelligence…). |
| `steps.maxFormula` | Computed maximum (optional) | Formula, optional | — | Kind of step: Pick contents, Spend points or Choose values | Optional: a computed maximum replacing the number. |
| `steps.perTargetMax` | At most per value | Whole number, optional, at least 0 | — | Kind of step: Spend points | Optional: the most points on any one value. |
| `steps.perTargetMaxFormula` | Computed maximum per value (optional) | Formula, optional | — | Kind of step: Spend points | Optional: that per-value maximum, computed. |
| `steps.optionCondition` | Options offered only if (optional) | Entry, optional | — | Kind of step: Pick contents or Choose values | Optional: a Condition; only the options for which it holds are offered (the chosen class's spells). |
| `steps.choicesLater` | The choices of these Contents are made at a later step | Yes / no | Yes | Kind of step: Pick contents | Ticked: the choices of these Contents are made at a later **Choices of the contents picked before** step. Unticked: they are made within this step. |
| `steps.required` | Required | Yes / no | Yes | Kind of step: Pick contents, Spend points or Choose values | Ticked: the player cannot leave the step without reaching the minimum. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the creation's help text. |

<a id="path-progression"></a>
### Progression (`progression`)

**What it builds:** A Progression System ("Progression" by default), or new entries added to an existing one. **Buy ranks**: an advancement “Advance: *name*” per value, with the cost Formula “Advancement cost” (and “Highest advancement rank”). **Level milestones**: one milestone per row, with a Condition “Level *n*” (level ≥ N).

**Example:** Buy skill ranks with XP: rank 1 = 1 XP, rank 2 = 2 XP, rank 3 = 4 XP. Or: at level 5, grant "Extra attack".

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `system` | Complete an existing progression | Entry, optional | — | always | Optional: an existing progression to complete. Empty: a new progression. |
| `name` | Name | Name | Progression | depends on “Complete an existing progression” | The new progression's name. Shown when no existing progression is chosen. |
| `mode` | Kind of progression | Choice | Buy ranks | always | **Buy ranks**: spend a currency (XP, practice points) to raise values one rank. **Level milestones**: at some levels, grant things or run an Action. |
| `values` | Values that improve | List, at least 1 | — | Kind of progression: Buy ranks | One row per value that progresses. |
| `values.value` | Value | Entry | — | always | The value bought rank by rank. |
| `values.currency` | Paid with (if different) | Entry, optional | — | always | Optional: a currency for this value only; else the one of “Paid with”. |
| `currency` | Paid with | Entry, optional | — | Kind of progression: Buy ranks | The currency paid: a pool (its points) or a value (its base), spent by the character. Every value needs a currency, here or on its row. |
| `cost` | Cost of a rank | Choice | A table by rank | Kind of progression: Buy ranks | **A table by rank**: one cost per rank aimed at. **A calculation**: a calculation reading the rank aimed at (Context value `variables.advance.next`). |
| `costs` | Cost of each rank | List, at least 1 | — | Kind of progression: Buy ranks and Cost of a rank: A table by rank | The cost table, one row per rank. A rank missing from the table cannot be bought. |
| `costs.level` | Rank | Whole number | — | always | The rank aimed at. |
| `costs.cost` | Cost | Number, at least 0 | — | always | What reaching that rank costs, taken from the currency. |
| `costFormula` | Cost calculation (reads the rank sought) | Formula | — | Kind of progression: Buy ranks and Cost of a rank: A calculation | The cost's calculation, reading the rank aimed at. |
| `maximum` | Highest rank (optional) | Formula, optional | — | Kind of progression: Buy ranks | Optional: the highest rank that can be bought (a number or a calculation). |
| `level` | Level | Entry | — | Kind of progression: Level milestones | The level value that triggers the milestones: an existing one or one created here with [Level and experience](#path-level). |
| `milestones` | Milestones | List, at least 1 | — | Kind of progression: Level milestones | One row per milestone. |
| `milestones.level` | Level | Whole number | — | always | The milestone's level. |
| `milestones.grants` | Grants | Entries, optional | — | always | Optional: the Definitions granted to the character when the milestone is reached (a feat, a power). |
| `milestones.action` | Runs the Action | Entry, optional | — | always | Optional: an Action run when the milestone is reached. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the progression's help text. |

<a id="path-scale"></a>
### Descriptive scale (`scale`)

**What it builds:** A Description scale, and its link on the chosen values and types that have none yet (a scale already linked is never replaced). On a sheet, those who cannot see the number see the words.

**Example:** Health as a percentage of the maximum: 76-100 "Unhurt", 26-75 "Wounded", 1-25 "Badly wounded", 0 "Down".

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The scale's name. |
| `basis` | Ranges in | Choice | Value | always | **Value**: ranges are about the value itself. **Percent of the maximum**: about the percentage of a pool's maximum. |
| `rows` | Steps | List, at least 1 | — | always | One row per step of the scale. |
| `rows.min` | From | Number, optional | — | always | Optional: the bottom of the range (included). Empty: no lower limit. |
| `rows.max` | To | Number, optional | — | always | Optional: the top of the range (included). Empty: no upper limit. |
| `rows.words` | Words | Text | — | always | The words shown for that range. |
| `rows.id` | Id (optional) | Text, optional | — | always | Optional: the step's id, to find it in calculations; else `row-1`, `row-2`… |
| `definitions` | Values described | Entries, optional | — | always | Optional: the values described by the scale. |
| `types` | Types described | Entries, optional | — | always | Optional: the types whose values are all described by the scale. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the scale's help text. |

<a id="path-contentType"></a>
### Content type (`contentType`)

**What it builds:** A Content Type with its fields. The Contents themselves (a sword, the Fireball spell) are created next in the configurator or by import, then given to Actors.

**Example:** Weapon: item, fields Damage (text, `1d8`), Range (whole number), Skill (a Definition of type Skill).

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The type's name (Weapon, Spell, Origin…). |
| `storage` | In Foundry | Choice | An item | always | **An item**: each Content is a Foundry Item (equipment, spells). **An actor**: an Actor (familiar, mount, vehicle). |
| `stackable` | Stackable (quantity) | Yes / no | No | always | Ticked: an Actor may hold several, counted by a quantity (arrows, potions). Unticked: each Content is unique. |
| `fields` | Fields | List, optional | — | always | Optional: the fields of each Content of this type, read by dice (`@content.<id>`) and the "Content field" operand. |
| `fields.name` | Name | Name, with id | — | always | The field's name; its id (read by calculations) is made from the name ("Damage" → `damage`) or given. |
| `fields.valueType` | Kind of value | Choice | Number | always | **Number**, **Whole number**, **Yes or no**, **Text**, or **A Definition** (a Definition, such as a weapon's skill). |
| `fields.referenceType` | Definitions of this type | Entry, optional | — | Kind of value: A Definition | Optional: limits the Definitions accepted to this type. |
| `fields.many` | Several values | Yes / no | No | always | Ticked: the field takes a list of values. |
| `fields.required` | Required | Yes / no | No | always | Ticked: a Content must fill it in. |
| `fields.nullable` | May stay empty | Yes / no | No | always | Ticked: the field may stay empty (no value). |
| `availability` | Usable only if (optional) | Entry, optional | — | always | Optional: a Condition; Contents of this type can only be used while it holds. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the type's help text. |

<a id="path-permission"></a>
### Permissions (`permission`)

**What it builds:** One Permission per chosen entry (“Permission: *name*”), denying by default except for its rules. An Action: only the chosen roles may run it. A value or a type: everyone reads it, only the chosen roles change it. A Content Type: its owner uses a Content, only the chosen roles give or change one.

**Example:** Characteristics changed by the GM only; the Action "Give XP" kept for the GM.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `kind` | What is restricted | Choice | Using Actions | always | **Using Actions**: run Actions. **Changing values**: change some values. **Changing the values of a type**: change every value of a type. **Giving Contents of a type**: give or change the Contents of a type. |
| `actions` | Actions | Entries, at least 1 | — | What is restricted: Using Actions | The Actions kept. |
| `definitions` | Values | Entries, at least 1 | — | What is restricted: Changing values | The values kept. |
| `types` | Types | Entries, at least 1 | — | What is restricted: Changing the values of a type | The types whose values are kept. |
| `contentTypes` | Content Types | Entries, at least 1 | — | What is restricted: Giving Contents of a type | The Content Types whose assignment is kept. |
| `who` | Restricted to | Choice | The GM and assistants | always | **The GM**; **The GM and assistants** (the GM and assistant GMs); **Trusted players too** (Foundry's trusted players too). |
| `name` | Name (optional, for a single entry) | Name, optional | — | always | Optional: the Permission's name, only used when a single entry is chosen; otherwise each is named “Permission: *name*”. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Permissions' help text. |

## Paths: Building blocks

<a id="path-definitionType"></a>
### Definition type (`definitionType`)

**What it builds:** A Definition Type with one capability (allowed, default and required) and its fields. Computed bounds become Formulas “Minimum: *name*” / “Maximum: *name*”.

**Example:** Type "Skill": a number, from 0 to 5, with a field "Linked characteristic" (a Definition).

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The type's name. |
| `capability` | What its values are | Choice | A number | always | What the type's values are: **A number** (characteristics, skills), **A gauge** (a gauge with a minimum and a maximum: HP, mana), **A condition, on or off** (a state, active or not: Poisoned). Other capabilities are added in the type's editor. |
| `minimum` | Lowest value | Formula, optional | — | What its values are: A number | Optional: the lowest value of every value of the type (a number or a calculation). |
| `maximum` | Highest value | Formula, optional | — | What its values are: A number | Optional: the highest value. For a bound only in some cases (player characters), use [Bounds of a value](#path-bounds) afterwards. |
| `fields` | Fields | List, optional | — | always | Optional: fields each Definition of this type fills in (a short description, a linked characteristic…). |
| `fields.name` | Name | Name, with id | — | always | The field's name; its id is made from the name or given. |
| `fields.valueType` | Kind of value | Choice | Number | always | **Number**, **Whole number**, **Yes or no**, **Text**, or **A Definition** (a Definition). |
| `fields.referenceType` | Definitions of this type | Entry, optional | — | Kind of value: A Definition | Optional: limits the Definitions accepted to this type. |
| `fields.many` | Several values | Yes / no | No | always | Ticked: the field takes a list of values. |
| `fields.required` | Required | Yes / no | No | always | Ticked: every Definition must fill it in. |
| `fields.nullable` | May stay empty | Yes / no | No | always | Ticked: the field may stay empty. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the type's help text. |

<a id="path-value"></a>
### Value (`value`)

**What it builds:** A Definition (number) in the chosen type, with the values of its fields.

**Example:** Luck, Experience, Load, Fate points.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The value's name. |
| `type` | Type | Entry | New Definition type “Value” | always | The Definition Type: an existing one (holding a number) or a new one ("Value" by default). |
| `scale` | Description scale (optional) | Entry, optional | — | always | Optional: a description scale that shows words instead of the number. |
| `data` | Values of the type's fields | List, optional | — | always | Optional: the values of the fields defined on the type. |
| `data.field` | Field (id) | Text | — | always | The id of the type's field (as shown in the type's editor). |
| `data.entry` | Definition | Entry, optional | — | always | Optional: for a "A Definition" field, the Definition chosen. |
| `data.value` | Value | Text, optional | — | depends on “Definition” | The value, typed as text and converted according to the field's kind (number, yes/no, text). Shown when no Definition is chosen. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the value's help text. |

<a id="path-parameter"></a>
### Parameter (`parameter`)

**What it builds:** A Ruleset Parameter: a setting named once, the same for everyone, read by calculations with the "Parameter" operand.

**Example:** Standard difficulty = 15; Creation points = 25; Optional rule on = yes.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Parameter's name. |
| `valueType` | Kind of value | Choice | Whole number | always | **Number**, **Whole number**, **Yes or no** or **Text**. |
| `number` | Value | Number | — | Kind of value: Number or Whole number | The value, for a number. |
| `flag` | Value | Yes / no | No | Kind of value: Yes or no | The value, for yes or no (ticked = yes). |
| `text` | Value | Text | — | Kind of value: Text | The value, for a text. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Parameter's help text. |

<a id="path-formula"></a>
### Formula (`formula`)

**What it builds:** A Formula. When an identical calculation (same result, same expression) already exists, it is reused instead of doubled, unless you give an id or a description.

**Example:** "Strength bonus" = floor((Strength − 10) ÷ 2).

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Formula's name; the optional id is the one other rules refer to. |
| `resultType` | Result | Choice | Number | always | What the calculation gives: **Number**, **Whole number**, **Yes or no**, **Text**, or **A Definition** (a Definition, to choose a value by situation). A Formula reading a context value (an Action's question) should often be **Number**: **Whole number** refuses a non-whole result at publishing. |
| `expression` | Calculation | Formula | — | always | The calculation, with the visual editor. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the help text; a described Formula is always a new one. |

<a id="path-condition"></a>
### Condition rule (`condition`)

**What it builds:** A Condition. An identical Condition already there is reused, unless you give an id or a description.

**Example:** "Has enough mana": Mana ≥ 3; "Is a PC": Kind of Actor = played by a player.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Condition's name; the optional id is the one other rules refer to. |
| `expression` | True when | Condition | — | always | The true-or-false test, with the visual editor: comparisons (=, ≠, <, ≤, >, ≥), and, or, not, always true… |
| `description` | Description (optional) | Text, optional | — | always | Optional: the help text; a described Condition is always a new one. |

<a id="path-roll"></a>
### Roll (`roll`)

**What it builds:** A Roll (dice), with its variants. Plain dice without a name or variants reuse an identical Roll already there.

**Example:** Attack roll `1d20`, and `2d20kh` while "Advantage" holds.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name (optional) | Name, optional | — | always | Optional: the Roll's name. Without one, the Roll is named after its dice. |
| `formula` | Dice | Dice | — | always | The dice, in Foundry notation. They may read a field of the Content used (`@content.damage`) and an Action's question (`@input.level`), and the letters of special dice ([Special die](#path-die)). |
| `variants` | Other dice by Condition | List, optional | — | always | Optional: other dice rolled instead while a Condition holds; the first that holds wins. |
| `variants.condition` | When | Entry | — | always | The variant's Condition: an existing one or one created here. |
| `variants.formula` | Dice | Dice | — | always | The dice rolled while it holds. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Roll's help text. |

<a id="path-outcome"></a>
### Test result (`outcome`)

**What it builds:** A test Outcome, recognized by its Condition. Tests use it in the order set on each (“Existing results, in order (else created here)” of [Roll or test](#path-test)).

**Example:** "Exceptional success", key `exceptional`, when the margin ≥ 10.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Outcome's name, shown in the chat. |
| `resultKey` | Result key (read by calculations) | Text | — | always | The key rules read: `success`, `failure`, `critical`, `fumble` or your own. Actions refer to it ("Depending on the test's result") and calculations read it in `variables.test.outcome.resultKey`. An attack made by the assistant hits on every outcome but `failure` and `fumble`, and doubles on `critical`. |
| `condition` | Obtained when | Entry, optional | — | always | Optional: when the Outcome is reached, often a comparison of `variables.test.margin` (total − difficulty) or `variables.test.natural` (the natural die). Without a Condition, it only works as a Test's fallback outcome. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Outcome's help text. |

<a id="path-duration"></a>
### Duration (`duration`)

**What it builds:** A Duration, which Actions pick when they apply a state.

**Example:** "1 minute" = 10 rounds; "Until the combat ends".

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Duration's name. |
| `duration` | Lasts | Choice | Rounds | always | **Until removed**; **Rounds**; **Turns**; **Minutes**, **Hours**, **Days** (world time); **Until an event**. |
| `amount` | How many | Whole number, at least 1 | 1 | Lasts: Rounds, Turns, Minutes, Hours or Days | The number of rounds, turns, minutes, hours or days. |
| `event` | Event | Event | — | Lasts: Until an event | The event that ends the state. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Duration's help text. |

<a id="path-effect"></a>
### Effect (`effect`)

**What it builds:** An Effect: a change an Action makes. Depending on the answers, a Roll “Dice: *name*”, Formulas “Bonus: *name*”, “Multiplier: *name*”, “Factor: *name*”, “Target: *name*” or “Amount: *name*”.

**Example:** "Sword damage": take 1d8 + Strength from the target's Hit points. "Ammunition": take 1 from the "Ammunition" field of the weapon used.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Effect's name. |
| `writes` | What changes | Choice | A Definition | always | **A Definition**: a value, pool or state of an Actor. **A field of the Content used**: a field of the Content the Action uses (a weapon's ammunition). |
| `target` | Value changed | Entry | — | What changes: A Definition | The Definition changed: a pool (its points), a value (its base) or a state. |
| `chosenBy` | Definition chosen by a calculation (optional) | Formula, optional | — | What changes: A Definition | Optional: a Formula whose result is "A Definition" choosing, at use, the Definition changed instead of “Value changed” (the skill tested, the characteristic picked in an Action's question). |
| `field` | Field (id) | Text | — | What changes: A field of the Content used | The id of the Content's field (such as `ammunition`). |
| `role` | Who it affects | Choice | The target | always | On whom: **The target** or **Oneself**. |
| `operation` | Change | Choice | Subtract | always | **Subtract**, **Add**, **Set to** or **Multiply by**. |
| `operand` | By how much | Choice | A number | always | The amount: **A number**, **A calculation**, **Dice** (rolled at each use) or **An existing roll** (an existing Roll, with its variants). |
| `amount` | Amount | Number | 1 | By how much: A number | The number taken, added, set or multiplied by. |
| `expression` | Calculation | Formula | — | By how much: A calculation | The calculation. A number, a Parameter, a Reference or a Formula are used as they are; any other calculation becomes a Formula. |
| `dice` | Dice | Dice | — | By how much: Dice | The dice (`1d8`, `2d6+@content.bonus`). |
| `roll` | Roll | Entry | — | By how much: An existing roll | The Roll: an existing one or one created here with [Roll](#path-roll). |
| `bonus` | Bonus added (optional) | Formula, optional | — | By how much: Dice or An existing roll | Optional: a bonus added to the dice total. |
| `multiplier` | Dice multiplier (optional) | Formula, optional | — | By how much: Dice or An existing roll | Optional: multiplies the number of dice (2 on a critical: 1d8 becomes 2d8). |
| `factor` | Factor applied to the total (optional) | Formula, optional | — | By how much: Dice or An existing roll | Optional: multiplies the total (dice + bonus), rounded down (½ for a resistance). |
| `minimum` | At least | Number, optional | — | By how much: Dice or An existing roll | Optional: the amount never goes below this number. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Effect's help text. |

<a id="path-action"></a>
### Action (`action`)

**What it builds:** An Action (a game button) bringing together entries already created: its questions, conditions, costs, Test, Effects, states applied or removed, and what each result of the Test does. Create the Effects, Tests and states first with their paths.

**Example:** "Shoot": question "Bullets" (1 to 3), possible when Ammunition ≥ 1, cost "One bullet", Test "Shooting", on a success the Effect "Damage", on a critical the Action "Grave wound" as well.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Action's name (its button on the sheet). |
| `inputs` | Questions asked on use | List, optional | — | always | Optional: questions asked to the player when they use the Action; answers are read in calculations (Context value `variables.input.<id>`) and dice (`@input.<id>`). |
| `inputs.name` | Question | Name, with id | — | always | The question's text; the optional id is the one calculations read (else made from the text: "Bullets fired" → `bullets_fired`). |
| `inputs.valueType` | Answer | Choice | Number | always | The kind of answer: **Number**, **Whole number**, **Yes or no**, **Text**, or **A Definition** (a Definition to choose). |
| `inputs.definitionType` | Definitions of this type | Entry | — | Answer: A Definition | For **A Definition**: the type the player picks a Definition of. |
| `inputs.default` | Default answer | Text, optional | — | Answer: Number, Whole number, Yes or no or Text | Optional: the suggested answer, converted according to the kind of answer. |
| `inputs.required` | Required | Yes / no | Yes | always | Ticked: the player must answer. |
| `inputs.options` | Choices offered (optional) | List, optional | — | Answer: Number, Whole number, Yes or no or Text | Optional: a list of answers to choose from instead of a free field. |
| `inputs.options.label` | Label | Text | — | always | The text shown for this choice. |
| `inputs.options.value` | Value | Text | — | always | The value stored for this choice, converted according to the kind of answer. |
| `conditions` | Only possible if | Entries, optional | — | always | Optional: the Conditions that must all hold to use the Action. |
| `costs` | Costs | Entries, optional | — | always | Optional: Effects paid on use, before the rest (spend a bullet, mana). |
| `test` | Roll | Entry, optional | — | always | Optional: the Test the Action rolls. |
| `effects` | Effects | Entries, optional | — | always | Optional: the Action's Effects. With a Test, they apply on the results without a row in “Depending on the roll's result”, or whose row does not replace them. |
| `applyStates` | Conditions applied | List, optional | — | always | Optional: the states the Action applies. |
| `applyStates.state` | State | Entry | — | always | The state applied. |
| `applyStates.duration` | Duration (optional) | Entry, optional | — | always | Optional: its Duration (an existing one or one created here with [Duration](#path-duration)). Empty: until removed. |
| `applyStates.stacking` | If already there | Choice | Restart its duration | always | When it is already there: **Restart its duration**, **Add a stack**, **Add another one** or **Do nothing**. |
| `removeStates` | Conditions removed | Entries, optional | — | always | Optional: the states the Action removes. |
| `role` | Who it affects | Choice | The target | always | Who gets the states applied and removed: **The target** or **Oneself**. (Each Effect has its own "Who is aimed at".) |
| `results` | Depending on the roll's result | List, optional | — | depends on “Roll” | Optional, with a Test: what each result does. Shown when a “Roll” is chosen. |
| `results.outcome` | Result | Entry, optional | — | always | Optional: the Outcome concerned. Empty: give a result key. |
| `results.resultKey` | Result | Text | — | depends on “Result” | The result key concerned (`success`, `critical`…), when no Outcome is chosen. |
| `results.replace` | Replaces the Action's Effects | Yes / no | Yes | always | Ticked: for this result, the row's Effects replace the Action's (no Effect listed = no Effect, useful on a failure). Unticked: the Action's Effects apply. |
| `results.effects` | Effects | Entries, optional | — | Replaces the Action's Effects: Yes | Optional: the Effects applied for this result. |
| `results.actions` | Actions chained | Entries, optional | — | always | Optional: Actions chained for this result (a critical table, a grave wound). |
| `targeting` | Several targets | Choice | One target | always | With several targets: **One target** (the main target only), **One roll per target** (the Test, Effects and follow-ups run for each target; costs and conditions once), **One roll for all** (as for each target, but the Effects' dice are rolled once for all, bonus and factors counted per target: a fireball). |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Action's help text. |

<a id="path-counter"></a>
### Counter (`counter`)

**What it builds:** A Definition (number) in the chosen type. With the button: an Effect and an Action “+1: *name*” (+1 on oneself). With a reset: an Effect, an Action and a Trigger “Reset: *name*” setting the value at the chosen event.

**Example:** "Attacks this round": +1 at each attack, back to 0 at each new round; a Condition "Attacks this round < 2" then limits the Action.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The counter's name. |
| `type` | Type of the counter | Entry | New Definition type “Counter” | always | The Definition Type: an existing one (holding a number) or a new one ("Counter" by default). |
| `increment` | Add a +1 button | Yes / no | Yes | always | Ticked: an Action “+1: *name*” on the sheet. |
| `resetOn` | Reset on | Event, optional | — | always | Optional: the event that sets the counter back to its starting value (new round, turn starts, time passing…). |
| `resetTo` | Reset value | Number | 0 | depends on “Reset on” | The value set at that event. |

<a id="path-trigger"></a>
### Trigger (`trigger`)

**What it builds:** A Trigger running Actions at an event. Triggers of the same event run in the order of their cards.

**Example:** Regeneration: at each turn start, the Action "+1 HP" for each Actor having the state "Regenerating".

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The Trigger's name. |
| `event` | When | Event | `rta.combat.round` | always | The event listened to: `rta.combat.start` (combat starts), `rta.combat.round` (new round), `rta.combat.turn` (turn starts), `rta.combat.end` (combat ends), `rta.time.elapsed` (time elapsed), or an Event Type of the Ruleset. |
| `conditions` | Only if | Entries, optional | — | always | Optional: Conditions that must all hold when the event happens. |
| `actions` | Actions run | Entries, at least 1 | — | always | The Actions run, in order (at least one). |
| `holder` | For whom | Choice | Each actor concerned | always | Who hears the event: **Each actor concerned** (each Actor concerned: the combatants, the one whose turn it is), **The combat** (the combat, once), **The world** (the world, once: time passing). |
| `mode` | How | Choice | By itself | always | **By itself**: the Actions run by themselves. **Offered to the player**: the player concerned gets an offer (a reaction) they accept or not. |
| `actingRole` | Who acts | Choice | The holder | always | Who performs the Actions: **The holder** or **The event's target**. |
| `description` | Description (optional) | Text, optional | — | always | Optional: the Trigger's help text. |

<a id="path-table"></a>
### Random table (`table`)

**What it builds:** A Random table, its Roll “Dice: *name*”, a Formula “Bonus: *name*” when a bonus is given and, when asked, an Action “Roll: *name*” that draws on the table.

**Example:** Hit location (1d10): 1-2 Head, 3-4 Arm, 5-10 Body; each row runs its wound's Action.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The table's name. |
| `dice` | Dice | Dice | — | always | The dice drawn (`1d100`, `2d6`). |
| `bonus` | Bonus to the roll | Formula, optional | — | always | Optional: a bonus added to the draw (the success margin, a level). |
| `rows` | Rows | List, at least 1 | — | always | One row per result of the table. |
| `rows.label` | Text | Text | — | always | The result's text, shown in the chat. |
| `rows.min` | From | Whole number, optional | — | always | Optional: the row's lowest draw (included). |
| `rows.max` | To | Whole number, optional | — | always | Optional: the row's highest draw (included). A row with neither "From" nor "To" never comes up at random. |
| `rows.actions` | Actions run | Entries, optional | — | always | Optional: the Actions run when the row comes up. |
| `action` | Add a button to roll | Yes / no | Yes | always | Ticked: an Action “Roll: *name*” to draw on the table from the sheet. |

<a id="path-die"></a>
### Special die (`die`)

**What it builds:** A Special die with custom faces and its counters (one per word of "Counts as"). A dice formula rolls it with its letter (`3db`).

**Example:** Ability die (letter `b`): blank faces, "Success", "Success ×2", "Advantage"; the roll counts successes and advantages.

| Key | Question | Kind | Default | Shown when | What it is for |
|---|---|---|---|---|---|
| `name` | Name | Name | — | always | The die's name. |
| `letter` | Letter in formulas | Text | — | always | The letter used in dice formulas (`1dX`), lowercased. Pick a letter Foundry does not already use. |
| `faces` | Faces | List, at least 2 | — | always | One row per face (at least two). |
| `faces.label` | Face | Text | — | always | The face's text or symbol, shown in the result. |
| `faces.value` | Value | Number, optional | — | always | Optional: the face's numeric value, added to the total. |
| `faces.counter` | Counts as | Text, optional | — | always | Optional: the counter the face raises ("Success", "Advantage"); faces sharing this word share the counter. |
| `faces.count` | How many | Whole number | 1 | depends on “Counts as” | How much the face adds to that counter. |

<a id="modules"></a>
## 8. For other modules

The assistant is also an API: `describeAssistantCatalog`, `describeAssistantPath`, `planAssistant`, `applyAssistant` and the panels of `registerAssistantPanel`. The keys of this guide are the API's, and answers are written as the catalog's `answerFormats` says. See [docs/architecture.md](architecture.md), section "Ruleset assistant for other modules".

<a id="maintenance"></a>
## 9. Keeping this guide up to date

This guide exists in English (this file) and French ([assistant-guide.fr.md](assistant-guide.fr.md)). The test `tests/assistant-docs.test.mjs` fails when a path or question is not documented in both languages, when a label, kind, default or display condition changed in the module and the guide did not follow, when an option of a choice is not explained, or when the guide speaks of a path or question that no longer exists. `node qa/assistant-doc-skeleton.mjs en` (or `fr`) prints the sections to redo, ready to paste, keeping the explanations already written.
