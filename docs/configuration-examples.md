# Rule Them'All: configuration examples

This document goes with the [GM guide](gm-guide.md). For each family in the Configurator, it gives three examples taken from different roleplaying games, with step-by-step settings. Field and button names match what the editor shows in English (module 1.0.20).

The examples don't copy the rulebooks. They show how to turn a rule into settings. Take the exact values (tables, costs, labels) from your own books. The examples were checked against the module's code but haven't been played in Foundry yet.

Contents:
- [Definitions](#definitions-section) and [Content](#content-section)
- [Rules (calculations and rolls)](#rules-calculations-and-rolls)
- [Rules (effects, actions, dice)](#rules-effects-actions-dice)
- [Orchestration](#orchestration)
- [Systems](#systems) and [Tags](#tags)

## Definitions section

### Definition Types

#### Call of Cthulhu characteristics (percentages, from 0 to 99)

In Call of Cthulhu 7th edition, STR, CON, DEX, APP, POW, SIZ, INT and EDU are percentage values that no investigator can go above.

1. In the Definitions section, open the Definition Types subsection and click Create.
2. In Name, type "Characteristic". In Description, write a short help text. It will show up in the editor of every characteristic.
3. Under Capabilities, set Value to Required and leave Pool, Collection and State on Unavailable.
4. In Lowest value, choose Number and type 0. In Highest value, choose Number and type 99.
5. Under Fields, click Add field: Name "Abbreviation", Value type Text, Cardinality one, Required checked.
6. Click Save & Quit. A new "Characteristic" subsection appears in the Definitions section, below Definition Types.

You don't set the Hard (half) and Extreme (one fifth) values here. They are two Formulas, in the Formulas family of the Rules section.

#### Fate skills and their adjective ladder

In Fate, a skill at +3 is called "Good" and one at +4 is "Great". The sheet shows the adjective instead of the number.

1. First, build the ladder in the Description scales family (Rules section). Leave Ranges compare on "the value", then click Add a band once per adjective: From 0 To 0 with the Description "Mediocre", From 1 To 1 "Average", From 2 To 2 "Fair", From 3 To 3 "Good", From 4 To 4 "Great", From 5 To 5 "Superb".
2. Go back to Definitions, open the Definition Types subsection and click Create. In Name, type "Skill".
3. In Description scale, choose the scale you just created.
4. Under Capabilities, set Value to Required.
5. In Lowest value, choose Number and type 0. A skill the character doesn't have counts as Mediocre.
6. Click Save & Quit.

Every skill of this type inherits the scale. A skill can pick a different one in its own Description scale field, which otherwise shows "That of its type". To show the adjective on the sheet, set the skill's value to display As a description in the sheet editor.

#### D&D 5e conditions (Blinded, Prone, Grappled…)

In D&D 5e, a condition is either there or not. It has no number, and its effects apply for as long as it lasts.

1. In Definition Types, click Create and type "State" in Name.
2. Under Capabilities, set State to Required. Leave Value, Pool and Collection on Unavailable.
3. If you want to spot states at a glance in the Configurator, check Customize next to Subsection color and pick a color. The checkbox only shows when Allow custom subsection colors is on, under Appearance in the General section.
4. Click Save & Quit. Then, in the new "State" subsection, create one Definition per condition: Blinded, Prone, Grappled, Restrained, and so on.

A state is applied by an Action (States applied field, Actions family of the Rules section). Its numeric effects, such as a penalty to attacks, are Modifiers (Modifiers family) that the Action attaches to the state.

For each checked state, the Action also says what happens if the target already has it, under **If the State is already there**: "Renew its duration" (the default), "Add the stacks and renew its duration", "Add another copy" or "Do nothing". Exhaustion, which is counted in levels, uses "Add the stacks and renew its duration" with **Stacks applied** set to 1. Each new application adds one level, and Formulas read it with the Reference "Exhaustion · state · state.stacks". A Modifier attached to the state keeps the value it had when the state was applied. For a penalty that grows with the levels, create instead a Modifier that the Action does not apply, and give it a Formula value that reads those stacks.

### Definitions

#### Hunger in Vampire: The Masquerade 5th edition (0 to 5, starts at 1)

In Vampire V5, Hunger is a gauge from 0 to 5. A newly created vampire starts at 1.

1. You need a definition type where Pool is Required, for example a "Resource" type.
2. In the Definitions section, open the "Resource" subsection and click Create. In Name, type "Hunger".
3. Pool shows up under Required capabilities (from the type). In the Pools area, click Add pool.
4. Fill in Slot ID "hunger", Label "Hunger" and Value type Whole number.
5. In Minimum, choose Number and type 0. In Maximum, choose Number and type 5. In Starting value, choose Number and type 1.
6. Leave Below minimum and Above maximum on Clamp to the bound. Hunger that would rise to 6 stays at 5.
7. Click Save & Quit.

The Rouse check, which raises Hunger, is an Action that changes the current value of this pool (Actions family).

#### The Mörk Borg backpack (Strength + 8 items)

In Mörk Borg, you can carry Strength + 8 items without trouble, and never more than twice that.

1. First, in the Formulas family (Rules section), create a "Maximum load" Formula that computes 2 × (Strength + 8): Operation Multiply, Operand 1 the Literal 2, Operand 2 a Calculation that Adds the Reference "Strength · value · value.final" and the Literal 8.
2. You also need an "Equipment" content type (Content section) and a definition type where Collection is Required, for example "Inventory".
3. In the "Inventory" subsection, click Create and type "Backpack" in Name.
4. In the Collections area, click Add collection. Type "items" in Slot ID and choose Owned content in Entry mode.
5. In Allowed content types, check "Equipment".
6. In Capacity Formula, choose "Maximum load". Leave Maximum entries empty: the Formula is enough to set the limit.
7. Click Save & Quit.

Being encumbered past Strength + 8 is a Condition (Conditions family). It checks that the Reference "Backpack · collection items · collection.count" (the number of items) is Greater than Strength + 8.

#### Martial Arts in Cyberpunk RED (DEX, double cost)

In Cyberpunk RED, each skill adds to a Stat, and a few skills, such as Martial Arts, cost double to improve.

1. The "Skill" type has two fields, added in its editor with Add field. The first: Name "Stat", Value type Reference, Reference target Definition, Definition Type "Stat". The second: Name "Double cost", Value type Yes or no, Default value false.
2. In the Definitions section, open the "Skill" subsection and click Create.
3. In Name, type "Martial Arts". The Definition Type field is read-only and shows "Skill".
4. The type's fields appear in the form. In Stat, choose "DEX". In Double cost, choose yes.
5. Leave Enabled checked, then click Save & Quit.

The skill roll Formula (Stat + skill + 1d10) and the advancement cost both read these fields. You set them up in the Formulas and Tests families, and in an advancement System.

## Content section

### Content Types

#### Pathfinder 2 consumables (potions, ammunition)

In Pathfinder 2, you often own several copies of the same consumable, such as three identical healing potions.

1. In the Content section, open the Content Types subsection and click Create. In Name, type "Consumable".
2. In Foundry storage, choose Item, then pick the subtype you want in Foundry Item subtype if there is more than one.
3. In Default runtime mode, choose Stackable. A character can then acquire the same consumable several times.
4. Under Fields, use Add field to add "Level" (Whole number), "Price in gp" (Number), "Bulk" (Text) and "Traits" (Text, Cardinality many).
5. Click Save & Quit. A "Consumable" subsection appears in the Content section, below Content Types.

#### Traveller starships (stored as Actors)

In Traveller, a starship has its own sheet and its own token on the map, just like a character.

1. In Content Types, click Create and type "Starship" in Name. Add an Image if you like, with Choose / Replace.
2. In Foundry storage, choose Actor.
3. In Foundry Actor subtype, choose the actor subtype provided by the Foundry system you use (required if there is more than one).
4. Leave Default runtime mode on Unique.
5. Under Fields, add "Tonnage", "Jump rating", "Manoeuvre rating", "Hull" and "Armour", all as Whole number.
6. Click Save & Quit.

Each ship you then create in the "Starship" subsection works as a template. An Actor made from it, for example dragged from its compendium, takes on its values, its Actions and the Item Contents it grants, which become Items of that Actor.

#### Shadowrun spells (Awakened characters only)

In Shadowrun, only a character with the Magic attribute can cast a spell.

1. First, in the Conditions family (Rules section), create an "Awakened character" Condition that checks that Magic is greater than 0.
2. In Content Types, click Create and type "Spell" in Name. Keep Foundry storage on Item.
3. In Availability, choose "Awakened character". As long as this Condition is false, a spell's Actions can't be used.
4. Under Fields, add "Category", "Type (physical or mana)", "Range" and "Duration" as Text, and "Drain" as Whole number.
5. Click Save & Quit.

The Availability Condition can also read the spell's own fields.

### Content

#### The Pathfinder 2 minor healing potion

In Pathfinder 2, a minor healing potion (level 1, 4 gp) restores 1d8 Hit Points to whoever drinks it.

1. You need the "Consumable" type from above and a "Drink a healing potion" Action that restores 1d8 HP (Actions family).
2. In the Content section, open the "Consumable" subsection and click Create.
3. In Name, type "Minor healing potion", and add a Description if you like.
4. Leave Runtime mode on "Same as its type (Stackable)".
5. Fill in the type's fields: Level 1, Price in gp 4, Bulk "L", Traits "consumable", "healing", "potion" (one value per line).
6. Open Relations, click Add relation, then choose the Operation Grant on acquisition and the Related object "Drink a healing potion".
7. Click Save & Quit.

To make buying it cost gold, choose a "Buy" Action that takes away the 4 gp in Acquisition Action. Otherwise, leave it on "No Action: grant directly".

A Content can also grant other Contents. For a "Healer's kit" that comes with three potions, add a relation Grant on acquisition with the Related object "Minor healing potion", and type `{"count": 3}` in its Advanced parameters (JSON). Acquiring the kit then gives the character three potions, created as Items.

#### The D&D 5e Battle Master archetype (three maneuvers to choose from)

In D&D 5e, the Battle Master fighter gets superiority dice and picks three maneuvers from a list.

1. The maneuvers (Riposte, Menacing Attack, Disarming Attack, Feinting Attack, Parry…) are Actions, and the superiority dice are a Definition with a Pool.
2. In the subsection for the "Archetype" content type, click Create and type "Battle Master" in Name.
3. Under Relations, add a relation with the Operation Grant on acquisition and the Related object "Superiority dice".
4. Under Acquisition choices, click Add choice. Type "Maneuvers" in Name, 3 in Minimum and 3 in Maximum.
5. In Operation, choose Grant on acquisition. In Related object, check all the maneuvers on offer (the search field helps you find them).
6. Click Save & Quit.

When a character acquires the archetype, the player checks exactly three maneuvers, which become that character's Actions.

#### The Real World Fantasy "Permis B" (driving licence: Véhicules légers at 1)

In Real World Fantasy, a character with a car driving licence ("Permis B") starts with at least 1 in Véhicules légers (light vehicles).

1. In the subsection for the "Acquis de création" content type, click Create and type "Permis B" in Name.
2. In Description, write "À partir de 19 ans : au moins 1 en Véhicules légers." (from age 19: at least 1 in Véhicules légers).
3. Under Relations, click Add relation. Choose the Operation Grant on acquisition and the Related object "Véhicules légers".
4. Open Advanced parameters (JSON) under the relation and type `{"initial": {"value.base": 1}}`. The skill then arrives with a base value of 1.
5. Click Save & Quit.

If you use `{"add": {"value.base": 1}}` instead, the acquisition adds 1 to the value, whether or not the character already has the skill. Bonuses from several Content entries add up.

In an Acquisition choice, you enter this bonus without JSON. When the Operation is Grant on acquisition, each Definition with a value that you check in Related object gets a field with its name below the list. This is how the skill choices in RWF's Parcours (backgrounds) give +1 to the chosen skill: check the skills on offer and type 1 next to each one.

## Rules (calculations and rolls)

Every family in this section works the same way: open the family under Rules, click **Create**, fill in the editor, then click **Save & Quit** (**Apply** saves and keeps the editor open). In the Rules menu, Parameters, Formulas, Derived Outputs and Conditions sit under the **Computing** heading, and Rolls, Outcomes and Tests under **Rolls**. Each element has a **Name** and an **Enabled** checkbox, which is ticked by default. Its **Description** and **Tags** are in the folded **Notes and tags** section.

You build Formulas and Conditions in a visual editor. For each operand, you pick its kind from a list: **Literal**, **Parameter**, **Formula**, **Reference**, **Context value**, **Dice of the roll**, **Distance** or **Actors nearby**. A Reference is shown as "Name · capability · output", for example "Stealth · value · value.final". By default it is read on the Actor being evaluated. The **Read on** list (**Evaluated Actor** by default) lets you read it on **Self**, the **Target**, the **Source**, the **Owner**, the **Subject (reaction)**, the **Group leader**, the **World** or the **Combat in progress** instead. The World and the Combat in progress hold the values shared by the whole table rather than by one character. For a **Context value**, the field suggests the paths the engine fills in, each with a short explanation: `variables.test.natural`, `variables.input.<id>`, `variables.creation.<step id>.total`, `event.payload.<field>`, and so on.

An operand can itself be a **Calculation**. It picks its own operation, and its operands open below it, indented. You can nest as many levels as you need, for example to round the result of a division. The **Technical** section shows the expression's JSON as read-only text, updated with every change.

### Parameters

A Parameter is a constant of the Ruleset. You change it in one place, and every rule that reads it follows along.

#### The base for passive scores in D&D 5e

In D&D 5e, a passive score (such as passive Perception) equals 10 plus the skill bonus.

1. In **Parameters**, click **Create**.
2. **Name**: "Passive score base".
3. **Value type**: Whole number.
4. **Value**: `10`.
5. Click **Save & Quit**. The passive Perception Formula will read this Parameter (see the D&D 5e example in Derived Outputs).

#### The success divisors in Call of Cthulhu

In Call of Cthulhu, a hard success means rolling under half the skill, and an extreme success means rolling under a fifth of it.

1. Create a first Parameter. **Name**: "Hard divisor", **Value type**: Whole number, **Value**: `2`.
2. Create a second Parameter. **Name**: "Extreme divisor", **Value type**: Whole number, **Value**: `5`.
3. Both Parameters are used in the threshold Formulas (see the Call of Cthulhu example in Formulas).

#### The success threshold in Savage Worlds

In Savage Worlds, a roll succeeds on 4 or more, and every full 4 points above that gives a raise.

1. In **Parameters**, click **Create**.
2. **Name**: "Savage Worlds threshold".
3. **Value type**: Whole number.
4. **Value**: `4`.
5. Click **Save & Quit**. This one Parameter is used twice: as the Test's target, through a **Single value** Formula that reads it, and in the raise Condition (see the Savage Worlds example in Outcomes).

### Formulas

A Formula calculates a value. You choose an **Operation**: Single value, Add, Subtract, Multiply, Divide, Remainder of a division, Minimum, Maximum, Sum, Average, Round down, Round up, Round to nearest, Keep between two values, If… then… else, Table of ranges or Table of values. Add, Subtract, Multiply, Divide, Minimum, Maximum, Sum and Average take as many operands as you need (**Add operand**). Remainder of a division takes a **Value** and a **Divisor**. A rounding operation takes one **Value**. Keep between two values takes a **Value**, a **Minimum** and a **Maximum**. If… then… else takes a condition (**If**), then the **Then** and **Else** values. A Table of ranges sorts a **Value** into **From** / **To** / **Result** rows (**Add range**), with an optional **Otherwise** value. A Table of values does the same with a **Key** and **Key** / **Result** rows (**Add value**).

#### The target value of a Warhammer Fantasy 4e test

In Warhammer Fantasy 4e, you roll 1d100 under the skill, raised or lowered by the difficulty (from +40 to −30).

1. In **Formulas**, click **Create**. **Name**: "Melee target".
2. **Result type**: Whole number.
3. **Operation**: **Add**.
4. Operand 1: **Reference**, then "Melee · value · value.final".
5. Click **Add operand**. Operand 2: **Context value**, path `variables.input.difficulte`.
6. Click **Save & Quit**. The difficulty is a choice the player makes when they act, so you declare it on the Action, in its **Choices when used** (Actions family). The Formula then serves as the **Target** in the Test.

#### The hard and extreme thresholds in Call of Cthulhu

The extreme threshold is the skill divided by 5, and the hard threshold is the skill divided by 2.

1. In **Formulas**, click **Create**. **Name**: "Extreme threshold".
2. **Result type**: Number.
3. **Operation**: **Divide**.
4. Operand 1: **Context value**, path `variables.test.target` (the target of the current Test, which is the skill being tested).
5. Operand 2: **Parameter**, "Extreme divisor".
6. Click **Save & Quit**, then do the same for "Hard threshold" with the "Hard divisor" Parameter.
7. The division can give a decimal number (63 / 5 = 12.6). That is fine: a die roll is a whole number, so "roll less than or equal to 12.6" is the same as "roll less than or equal to 12".

#### The ability modifier in D&D 5e

In D&D 5e, an ability modifier equals (score − 10) / 2, rounded down: 15 gives +2, and 8 gives −1.

1. In **Formulas**, click **Create**. **Name**: "Strength modifier".
2. **Result type**: Whole number.
3. **Operation**: **Round down**.
4. **Value**: **Calculation**, then the **Divide** operation. Its two operands open below it.
5. Operand 1 of the division: **Calculation**, **Subtract** operation, with operand 1 set to the **Reference** "Strength · value · value.final" and operand 2 set to the **Literal** `10`.
6. Operand 2 of the division: **Literal** `2`.
7. Click **Save & Quit**. Create the other five modifiers the same way, or right-click this one's card, choose **Duplicate** and change the Reference. For a target's saving throw, the same Reference with **Read on** set to **Target** gives the target's own modifier.

#### The dice pool in Shadowrun

In Shadowrun, you roll as many d6 as your attribute plus your skill.

1. In **Formulas**, click **Create**. **Name**: "Attack pool".
2. **Result type**: Whole number.
3. **Operation**: **Add**.
4. Operand 1: **Reference**, "Agility · value · value.final".
5. Operand 2: **Reference**, "Firearms · value · value.final".
6. Click **Save & Quit**. Create "Defense pool" (Reaction + Intuition) the same way. The Test will read these Formulas through an input, and the Roll will use it as its number of dice (see the Shadowrun example in Tests).

### Derived Outputs

A Derived Output connects a Formula to a Definition output. Nobody types the value in anymore: it is calculated for each Actor that reads it, and Effects can no longer write to it. Modifiers still apply on top of a derived final value.

#### Passive Perception in D&D 5e

Passive Perception equals 10 plus the Perception bonus. Here, the "Perception" Definition already holds the full skill bonus.

1. Create the "Passive Perception" Definition with the value capability (Definitions family).
2. In **Formulas**, create "Passive Perception calculation": **Operation** **Add**, operand 1 the **Parameter** "Passive score base", operand 2 the **Reference** "Perception · value · value.final".
3. In **Derived Outputs**, click **Create**. **Name**: "Calculated passive Perception".
4. **Formula**: "Passive Perception calculation".
5. **Target output**: "Passive Perception · value · value.final".
6. Click **Save & Quit**. The sheet now shows passive Perception without anyone having to type it in.

#### Parry in Savage Worlds

Parry equals 2 plus half the Fighting die (a d8 gives 2 + 4 = 6). Trait dice go from d4 to d12, so half is always a whole number.

1. In **Formulas**, create "Parry calculation": **Operation** **Add**, operand 1 the **Literal** `2`.
2. Operand 2: **Calculation**, **Divide** operation, with operand 1 set to the **Reference** "Fighting · value · value.final" and operand 2 set to the **Literal** `2`.
3. In **Derived Outputs**, click **Create**. **Name**: "Calculated Parry".
4. **Formula**: "Parry calculation". **Target output**: "Parry · value · value.final".
5. Click **Save & Quit**. Toughness works the same way, using Vigor and armor.

#### Armor Class in Pathfinder 2

In Pathfinder 2, AC equals 10 plus the Dexterity modifier, the armor proficiency bonus and the item bonus of the armor being worn.

1. In **Formulas**, create "AC calculation": **Operation** **Add**.
2. Operand 1: **Literal** `10`. Operand 2: **Reference** "Dexterity · value · value.final".
3. Operand 3: **Reference** "Armor proficiency · value · value.final". Operand 4: **Reference** "Armor bonus · value · value.final".
4. In **Derived Outputs**, click **Create**. **Name**: "Calculated AC".
5. **Formula**: "AC calculation". **Target output**: "Armor Class · value · value.final".
6. Click **Save & Quit**. A Shield spell still works: it is a Modifier (Modifiers family) that adds to the derived final value.

### Conditions

A Condition is a question the engine answers with true or false. You choose an **Operation**: a comparison (Equals, Not equal, Greater than, Greater or equal, Less than, Less or equal) with its two operands, **And (all true)**, **Or (at least one true)**, **Not (the opposite)**, **If… then… else**, **Always true** or **Always false**. The operands of And, Or and Not are usually comparison **Calculations**. During a Test, **Context value** gives you access to the roll: `variables.test.natural` (the natural die), `variables.test.total`, `variables.test.target` (the target) and `variables.test.margin` (the total minus the target).

#### The natural 20 in D&D 5e

In D&D 5e, a 20 on the d20 is a critical success, whatever the total.

1. In **Conditions**, click **Create**. **Name**: "Natural 20".
2. **Operation**: **Equals**.
3. Operand 1: **Context value**, path `variables.test.natural`.
4. Operand 2: **Literal** `20`.
5. Click **Save & Quit**. Create "Natural 1" the same way. The Test's Outcomes use these Conditions.

#### The extreme success in Call of Cthulhu

An extreme success needs a roll less than or equal to a fifth of the skill.

1. In **Conditions**, click **Create**. **Name**: "Roll under extreme threshold".
2. **Operation**: **Less or equal**.
3. Operand 1: **Context value**, path `variables.test.total`.
4. Operand 2: **Formula**, "Extreme threshold" (see the Call of Cthulhu example in Formulas).
5. Click **Save & Quit**, then create "Roll under hard threshold" with the "Hard threshold" Formula. The Formula is calculated inside the current Test, so it reads the skill being tested.

#### The fumble in Call of Cthulhu

A fumble is a roll of 100, or a roll of 96 to 100 when the skill is below 50.

1. In **Conditions**, click **Create**. **Name**: "Fumble".
2. **Operation**: **If… then… else**.
3. **If**: **Calculation**, **Less than** operation, with operand 1 set to the **Context value** `variables.test.target` (the skill being tested) and operand 2 set to the **Literal** `50`.
4. **Then**: **Calculation**, **Greater or equal** operation, with `variables.test.natural` and the **Literal** `96`.
5. **Else**: **Calculation**, **Equals** operation, with `variables.test.natural` and the **Literal** `100`.
6. Click **Save & Quit**. The skill Test uses it for its "Fumble" Outcome (see the Call of Cthulhu example in Tests).

#### The critical in Vampire: The Masquerade V5

In V5, two or more 10s among the dice rolled make a critical.

1. In **Conditions**, click **Create**. **Name**: "Pair of 10s".
2. **Operation**: **Greater or equal**.
3. Operand 1: **Dice of the roll**. In the controls that appear, choose **Number of dice**, leave the group field empty (it shows **Every group**), then pick **Equal to** and type `10` in **Face value**.
4. Operand 2: **Literal** `2`.
5. Click **Save & Quit**. If the Roll tags the Hunger dice as a group (for example `[faim]` in the dice formula), typing `faim` in the group field counts only those dice: that gives you a messy critical.

### Rolls

A Roll is a Foundry dice formula, checked when you save it. It can read `@test.<id>` (a Test input), `@input.<id>` (an Action input) and `@content.<field>` (the weapon or power being used). **Variants** replace the formula while their Condition is true, and the first true variant wins.

#### The d10 pool in Vampire: The Masquerade V5

In V5, you roll a pool of d10s, and each 6 or higher counts as a success.

1. In **Rolls**, click **Create**. **Name**: "V5 pool".
2. **Dice formula**: `(@test.reserve)d10cs>=6`.
3. Click **Save & Quit**. The roll's total is then the number of successes.
4. The `reserve` value comes from an input of the Test that uses this Roll (the Test's **Inputs** section, with an **Input ID** of `reserve`). The Shadowrun example in Tests works the same way.

#### Advantage and disadvantage in D&D 5e

With advantage, you roll two d20s and keep the higher one. With disadvantage, you keep the lower one. If you have both, they cancel out.

1. Create two Conditions: "Advantage" (**Context value** `variables.input.avantage` **Equals** `1`) and "Disadvantage" (same path, **Equals** `-1`). The `avantage` value is one of the Action's **Choices when used** (Actions family), with the allowed values 1, -1 and 0: the player picks 0 when both apply.
2. In **Rolls**, click **Create**. **Name**: "d20". **Dice formula**: `1d20`.
3. In **Variants**, click **Add a variant**. **Condition**: "Advantage". **Dice formula**: `2d20kh1`.
4. Add a second variant. **Condition**: "Disadvantage". **Dice formula**: `2d20kl1`.
5. Click **Save & Quit**. The natural die that "Natural 20" reads is the die you kept.

#### Action dice in Blades in the Dark

In Blades in the Dark, you roll as many d6 as your action rating and keep the highest. With zero dice, you roll 2d6 and keep the lowest.

1. Create the "No dice" Condition: **Context value** `variables.test.inputs.des` **Equals** **Literal** `0`.
2. In **Rolls**, click **Create**. **Name**: "Action dice". **Dice formula**: `(@test.des)d6kh1`.
3. In **Variants**, click **Add a variant**. **Condition**: "No dice". **Dice formula**: `2d6kl1`.
4. Click **Save & Quit**. In the Test, add the `des` input with its **Source** set to **Reference**, reading the rating of the action being rolled (for example "Finesse · value · value.final").

### Outcomes

An Outcome names one possible result of a Test. It has a **Result key**, which Actions and Formulas read back (to double damage on a critical, for example), and a **Condition**. Outcomes have no order of their own: the Test puts them in order, and the first true one wins.

#### The three results in Blades in the Dark

A 6 is a full success, a 4 or 5 is a partial success, and 1 to 3 is a failure.

1. Create two Conditions on `variables.test.total`: "At least 6" (**Greater or equal** `6`) and "At least 4" (**Greater or equal** `4`).
2. In **Outcomes**, click **Create**. **Name**: "Full success", **Result key**: `totale`, **Condition**: "At least 6".
3. Create "Partial success", **Result key**: `partielle`, **Condition**: "At least 4".
4. Create "Failure", **Result key**: `echec`, **Condition**: **Always (fallback result)**.
5. In the Test, put "Full success" before "Partial success" and set "Failure" as the **Fallback outcome**. A 6 also matches "At least 4", so the order is what makes the difference.

#### Automatic successes and failures in Warhammer Fantasy 4e

In Warhammer Fantasy 4e, a roll of 01 to 05 always succeeds and a roll of 96 to 00 always fails, whatever the skill.

1. Create the Conditions "05 or less" (`variables.test.natural` **Less or equal** `5`), "96 or more" (`variables.test.natural` **Greater or equal** `96`) and "Under the target" (`variables.test.margin` **Less or equal** `0`).
2. In **Outcomes**, create "Automatic success", **Result key**: `reussite`, **Condition**: "05 or less".
3. Create "Automatic failure", **Result key**: `echec`, **Condition**: "96 or more".
4. Create "Success", **Result key**: `reussite`, **Condition**: "Under the target". Create "Failure", **Result key**: `echec`, **Condition**: **Always (fallback result)**.
5. In the Test, the order is: Automatic success, Automatic failure, Success, with Failure as the **Fallback outcome**. Both successes share the same key, so to Actions they are the same result.

#### The raise in Savage Worlds

A roll that beats the threshold by 4 or more points gives a raise, which boosts the damage or the effect.

1. Create the "Raise" Condition: **Context value** `variables.test.margin` **Greater or equal** **Parameter** "Savage Worlds threshold".
2. Create the "Success" Condition: `variables.test.margin` **Greater or equal** **Literal** `0`.
3. In **Outcomes**, create "Raise" (**Result key** `prouesse`, **Condition** "Raise") and "Success" (**Result key** `reussite`, **Condition** "Success").
4. Create "Failure" (**Result key** `echec`, **Condition** **Always (fallback result)**).
5. In the Test (**Target**: the Formula that reads the "Savage Worlds threshold" Parameter), the order is Raise then Success, with Failure as the **Fallback outcome**. An Action can then read the `prouesse` key to add 1d6 to the damage.

### Tests

A Test brings everything together: the **Roll**, the **Target**, the **Inputs** it reads first, the **Extra rolls**, the **Calculation** (Bonus Formula, Total Formula, Margin Formula), the **Outcomes** in order and the **Fallback outcome**. Without a Margin Formula, the margin is the total minus the target.

#### A skill test in Call of Cthulhu

You roll 1d100 under the skill. A 01 is a critical, a 100 is a fumble (96 and up when the skill is below 50), and the hard and extreme thresholds give levels of success.

1. Create the "d100" Roll (**Dice formula** `1d100`), and the "Stealth" Formula (**Single value**, **Reference** "Stealth · value · value.final").
2. In **Tests**, click **Create**. **Name**: "Stealth test". **Roll**: "d100".
3. **Target**: the "Stealth" Formula.
4. In **Outcomes**, pick them from the **Add an outcome** list in this order: Critical (`variables.test.natural` equal to 1), Fumble (the "Fumble" Condition), Extreme ("Roll under extreme threshold"), Hard ("Roll under hard threshold"), Regular (`variables.test.margin` less than or equal to 0). Drag the rows to fix the order.
5. **Fallback outcome**: Failure.
6. Click **Save & Quit**. For another skill, right-click the Test's card and choose **Duplicate**: you only need to change the target Formula.

#### Opposed ranged attacks in Shadowrun

In Shadowrun, the attacker rolls their d6 pool (5s and 6s are successes) against the target's defense pool. The attack hits if the attacker gets more successes than the target.

1. Create the "d6 pool" Roll: **Dice formula** `(@test.reserve)d6cs>=5`.
2. Create the "Defense" Test: in **Inputs**, click **Add input**, **Input ID** `reserve`, **Value type** Whole number, **Source** **Formula** "Defense pool". **Roll**: "d6 pool". **Target**: **No target**.
3. Create the "Ranged attack" Test with the same `reserve` input, with its Source set to the **Formula** "Attack pool", and the same Roll.
4. **Target**: **Opposed by Defense**. The Action's target then rolls the "Defense" Test with its own values, and its total becomes the attack's target.
5. Add the "Hit" Outcome (Condition `variables.test.margin` **Greater than** `0`) and set "Miss" as the **Fallback outcome**. A tie therefore goes to the defender.
6. A Test that is itself opposed cannot be used as a defense.

#### The critical die in Cyberpunk RED

In Cyberpunk RED, you roll 1d10 + stat + skill. A natural 10 lets you roll one more d10 and add it. A natural 1 makes you roll a d10 and subtract it.

1. Create the "d10" (`1d10`) and "Critical d10" (`1d10`) Rolls, and the "Natural 10" and "Natural 1" Conditions on `variables.test.natural`.
2. Create the "Reflexes + Handgun" Formula (**Add** two **References**).
3. In **Tests**, click **Create**. **Name**: "Handgun shot". **Roll**: "d10".
4. In **Extra rolls**, click **Add an extra roll**: **Condition** "Natural 10", **Roll** "Critical d10", **Effect on the total** **Adds**.
5. Add a second one: **Condition** "Natural 1", **Roll** "Critical d10", **Effect on the total** **Takes away**.
6. Open **Calculation** and set **Bonus Formula** to "Reflexes + Handgun". Set **Target** to **Fixed value**, then **Value** to `15` (a difficult task).
7. Add the "Success" Outcome (`variables.test.margin` **Greater than** `0`, since you have to beat the difficulty), with "Failure" as the **Fallback outcome**.

## Rules (effects, actions, dice)

### Effects

An Effect changes a single editable value: it sets it, adds to it, subtracts from it, multiplies it or toggles it. In the **Target** list, each value of a Definition appears as "Name · capability · output". A pool also shows its slot, for example "Hit points · pool hp · pool.current". At the end of the list, "Field of the Content used: …" entries write a number field of the Item the Action was used from. An Effect does nothing on its own: an Action runs it, either as an effect or as a cost. The Effects that come after it in the same Action can read what it did at `variables.effects.<Effect id>` (`before`, `after` and `operand`).

#### Weapon damage in D&D 5e (critical hits and resistance)

A longsword deals 1d8 + Strength. On a critical hit you roll twice as many dice, and a resistant creature only takes half.

1. Open **Rules > Effects**, create an Effect and name it "Longsword damage".
2. **Target**: "Hit points · pool hp · pool.current". **Applies to**: Target.
3. **Operation**: Subtract. **Value source**: Dice roll.
4. **Roll**: the "1d8" Roll (Rolls family).
5. **Dice multiplier**: a Formula that equals 2 when the Test outcome is a critical, and 1 otherwise (Formulas family: **If… then… else**, where **If** is an **Equals** Calculation between `variables.test.outcome.resultKey` and the critical's key). Only the dice are doubled, not the bonus.
6. **Roll bonus**: the "Strength modifier" Formula.
7. **Factor after the roll**: a Formula that equals 0.5 if the target resists slashing damage, and 1 otherwise (**If… then… else**, with a Reference **Read on** **Target**). The result is rounded down.
8. **Lowest result**: 0, so that a big penalty never turns damage into healing.
9. The chat card shows the dice, the bonus, the factor and the amount applied, for example "1d8 : 5 + 3 = 8".

#### Refreshing Fate points in Fate

At the start of a session, each character's Fate points go back up to their Refresh value.

1. Create an Effect called "Refresh Fate points".
2. **Target**: "Fate points · pool fate · pool.current". **Applies to**: Self.
3. **Operation**: Set.
4. **Value source**: Reference, then **Reference**: "Refresh · value · value.final". The Effect reads the final value, bonuses included.
5. Leave **Definition chosen by** on "The target above".
6. Tick this Effect in the **Effects** of a "Start of session" Action (Actions family), which the GM runs on each character.

#### Crew Heat in Blades in the Dark

A loud score adds 2 Heat, a gauge that belongs to the crew rather than to a single character.

1. In **General**, click **Edit Ruleset** and open **Combat and shared resources**. Under **Shared resources**, tick the "Heat" Definition in **World resources**. It then exists only once for the whole table.
2. Create an Effect called "Loud score: +2 Heat".
3. **Target**: "Heat · pool heat · pool.current". **Applies to**: World.
4. **Operation**: Add. **Value source**: Literal value, **Value**: 2.
5. If Heat is a pool bounded from 0 to 9, any excess is brought back down to 9. This is the pool's default **Above maximum** setting, "Clamp to the bound".
6. Tick the Effect in the "Pay off the score" Action (Actions family).
7. In play, everyone sees Heat from the **Shared resources** button of the combat tracker, and the GM can change it there.

#### Ammunition in Cyberpunk RED

Each gun counts its own rounds. A shot spends one, and a reload refills the magazine from the character's ammo reserve.

1. In the Content section, give the "Weapon" Content Type a Whole number field called "Magazine".
2. Create the "Spend a round" Effect. **Target**: "Field of the Content used: Magazine". **Operation**: Subtract. **Value source**: Literal value, **Value**: 1.
3. Tick it in the **Cost Effects** of the "Shoot" Action that each weapon grants. The Effect writes on the weapon the Action was used from, so two pistols keep separate counts.
4. For the reload, a "Fill the magazine" Effect uses the same **Target** with **Operation** Set and the magazine size as **Value**, for example 12.
5. A second Effect of the reload, "Take from the reserve", subtracts from the character's "Ammo" pool a Formula that reads the **Context value** `variables.effects.<id>.after` minus `variables.effects.<id>.before`, where `<id>` is the identifier of "Fill the magazine". Only the rounds actually loaded leave the reserve.

### Actions

An Action is what you trigger from a sheet. It checks its **Conditions**, pays its **Cost Effects**, makes its **Test (optional)**, then applies its **Effects**. If any Condition is false, nothing is written. Its result is posted as a card in the chat, and **Chat card buttons** can add buttons under that card to run a follow-up Action.

#### Fireball in D&D 5e

Every creature in the area takes the same 8d6 fire damage. Each one makes its own saving throw and takes only half on a success.

1. Create the "Fireball" Action. Under **Conditions**, tick "A level 3 slot is left" (Conditions family).
2. **Cost Effects**: "Spend a level 3 slot". It is paid only once, even with several targets.
3. **Targets**: "Each target, same dice". The damage roll is shared, while the Test and the Effects run for each target.
4. **Test (optional)**: "Dexterity save against the caster's DC" (Tests family).
5. **Effects**: a "Fire damage" Effect that subtracts the "8d6" Roll from hit points, with a **Factor after the roll** that equals 0.5 when the save succeeds (see the Effects family).
6. Leave **On each outcome** set to "Run the Action's effects" for every outcome: the factor is what makes the difference.

#### Second Chance in Shadowrun

By spending one point of Edge, the player rerolls every die in their pool that isn't a hit (anything under 5).

1. Create the "Second Chance" Action. **Conditions**: "Some Edge is left". **Cost Effects**: "Spend 1 Edge".
2. Open the **Reroll** section and tick **Rerolls another Action**.
3. Leave **Keep the same dice** unticked: you want fresh dice.
4. **Dice thrown again**: "Only some dice". **Dice group**: "Any group".
5. **Dice showing**: "below", **Value**: 5. **Instead, set them to**: "Throw them again".
6. Under **Actions it can reroll**, tick the skill test Actions. Hits already rolled stay on the table.
7. To forbid a second reroll, add a Condition that reads `variables.reroll.count` (1 for the first reroll).

#### Group actions in Blades in the Dark

Every member of the team rolls, you keep the best result, and the leader takes 1 stress for each member who failed.

1. Create the "Group action" Action. Open the **Several Actors** section.
2. **Group Test**: the "Action roll" Test (Tests family), with its success, partial success and failure Outcomes.
3. Tick **The acting Actor takes part**. **Members**: "Chosen when the Action is used".
4. **Test (optional)**: a "Group result" Test with no Roll, whose total Formula reads `variables.group.best`, the best total among the members.
5. **Effects**: "Leader's stress", an Effect that adds to the Stress pool (**Applies to**: Self) a Formula reading `variables.group.outcomes.failure`, the number of members who failed. The last part is the **Result key** of the failure Outcome.

#### Attack, then damage, in D&D 5e (chat card buttons)

The attack roll goes to the chat first. If it hits, the player clicks a button on the card to roll damage.

1. Open the "Attack" Action and its **Chat card buttons** section, then click **Add a button**.
2. **Action**: "Weapon damage". **Who uses it**: "The character's player". The button takes the name of that Action.
3. "Weapon damage" reads the attack's result in `variables.previous`: `total`, `margin`, `target`, `outcome` (the Outcome's result key), `roll` and `natural`.
4. Give "Weapon damage" a Condition that `variables.previous.outcome` equals "hit" (or "critical"), so a miss deals nothing. Its **Dice multiplier** can read the same value to double the dice on a critical.
5. Choose "Each target, for itself" instead for a saving throw that each target makes from the card, or "The GM" for something only the GM decides.

### Modifiers

A Modifier adjusts the final value of a Definition (its "value.final" output) without touching its base value. There are two ways to use one. If no Action applies it, it holds everywhere, as long as its **Conditions** are true. If an Action applies it, it only holds on the character who received it, for the duration chosen in the Action.

#### The Shield spell in D&D 5e

Shield gives +5 to Armor Class until the start of the caster's next turn.

1. Open **Rules > Modifiers** and create "Shield: +5 AC".
2. **Target**: "Armor Class · value · value.final".
3. **Operation**: Add. **Value source**: Literal value, **Value**: 5.
4. **Stacking**: "Always applies".
5. In the "Cast Shield" Action (Actions family), tick this Modifier under **Modifiers applied** and choose the "One round" Duration in **State duration** (Durations family).
6. The Modifier goes on the Action's target. With no token targeted, that's the caster.

#### Status bonuses in Pathfinder 2

Two status bonuses don't stack: with Heroism (+2) and Inspire Courage (+1), only the +2 counts.

1. Create the "Heroism" Modifier. **Target**: "Attack · value · value.final". **Operation**: Add, **Value**: 2.
2. **Stacking**: "Highest of its group". **Group**: `statut`.
3. Create "Inspire Courage" the same way, with **Value** 1 and the same **Group**, `statut`.
4. Do the same for circumstance bonuses with a `circonstance` group: the two groups add up with each other.
5. Each spell applies them through its **Modifiers applied** (Actions family).
6. **Application order** settles the calculation when a multiplication or a cap is mixed in with additions: the lowest numbers go first.

#### Encumbrance in Warhammer Fantasy 4e

A character who carries more than their encumbrance limit loses 1 point of Movement.

1. Create the "Overloaded" Condition (Conditions family): the carried load is above the calculated limit.
2. Create the "Overload" Modifier. **Target**: "Movement · value · value.final".
3. **Operation**: Subtract. **Value source**: Literal value, **Value**: 1.
4. Under **Conditions**, tick "Overloaded".
5. Don't put it in any Action. It applies by itself as soon as the Condition is true, and goes away when the character puts their pack down.
6. To keep a floor, add a second Modifier with the "At least" operation and a higher **Application order**. It stops Movement from dropping below the minimum.

### Durations

A Duration says how long a state or Modifier placed by an Action lasts. You choose it in the Action's **State duration** field, which covers every state and Modifier that Action applies. If you leave it on "Until removed", the state stays until another Action removes it.

#### One round, for Shield in D&D 5e

The +5 from Shield wears off on the next round.

1. Open **Rules > Durations** and create "One round".
2. **Mode**: "Fixed length".
3. **Amount**: 1. **Unit**: Rounds.
4. A round is counted in world time: Foundry's round length, 6 seconds by default. Each new round in the combat tracker moves the world clock forward that much, so the Duration expires one round later.
5. Choose this Duration in the **State duration** field of the "Cast Shield" Action (Actions family).

#### Invisibility in Chroniques Oubliées

The character stays invisible until they attack.

1. Create an "Attack made" Event Type (Orchestration section, Event Types family).
2. In every attack Action, tick "Attack made" under **Events triggered**.
3. Create the "Until the next attack" Duration. **Mode**: "Until an event". **Event Type**: "Attack made".
4. Create an "Invisible" Definition with the State capability (Definitions section).
5. In the "Cast Invisibility" Action, tick "Invisible" under **States applied** and choose this Duration in **State duration**.
6. As soon as the invisible character makes an attack, the event ends the state.

#### Seriously Wounded in Cyberpunk RED

While below half their hit points, the character takes a −2 penalty to their actions.

1. Create the "Below half HP" Condition (Conditions family).
2. Create the "While seriously wounded" Duration. **Mode**: "While a condition holds". **Condition**: "Below half HP".
3. Create the "Seriously wounded" state (a Definition with the State capability) and the "−2 to actions" Modifier (Modifiers family).
4. In the "Take damage" Action, tick the state under **States applied** and the Modifier under **Modifiers applied**, then choose this Duration in **State duration**.
5. The Condition is checked when world time moves forward or when an event involves the character. After healing, the state drops off at the next check.

### Dice

A Die has its own faces. Its **Letter** names it in Roll formulas (`2dp` rolls two dice with the letter p). Its **Counters** say what the faces count (Success, Advantage…). In a Formula or a Condition, the "Dice of the roll" operand followed by "Counter of the faces" reads a counter's total across all the dice rolled. Dice that share the same counter name add up, and a negative count cancels out.

#### Ability and difficulty dice in Star Wars FFG

The green die brings successes and advantages. The purple die brings failures and threats that cancel them out.

1. Open **Rules > Dice** and create "Ability". **Letter**: `a`.
2. **Counters**: add "Success" and "Advantage".
3. **Faces**: add 8 faces. For each one, **Shown as** gives the symbol, and the Success and Advantage fields give the counts: blank, S, S, SS, A, A, SA, AA.
4. Create "Difficulty", **Letter**: `v`, with the same "Success" and "Advantage" counters.
5. Its 8 faces carry negative counts: blank, Failure (Success −1), double Failure (Success −2), three Threat faces (Advantage −1), double Threat (Advantage −2), and Failure plus Threat (both at −1).
6. The Roll (Rolls family) is written, for example, as `2da+2dv`, and a "Success" Outcome (Outcomes family) requires the Success counter to be at least 1.

#### The stress die in Alien (Year Zero)

You roll base dice and stress dice. Every 6 is a success, and a 1 on a stress die triggers panic.

1. Create the "Base" Die, **Letter** `b`, with a "Success" counter. Six faces: only the sixth counts 1 Success.
2. Create the "Stress" Die, **Letter** `s`, with the "Success" and "Panic" counters.
3. On the stress Die, face 1 counts 1 Panic, face 6 counts 1 Success, and the others stay blank.
4. The Roll is written, for example, as `4db+2ds`. Successes from both kinds of dice add up, because the counter has the same name.
5. A "Panic" Condition (Conditions family) checks that the Panic counter is at least 1. A Trigger or an Outcome then runs the panic roll.

#### The Marvel die in the Marvel Multiverse RPG

The d616 is played with three d6, and the middle one is special: its 1 is the Marvel face, which counts as 6 and can give a Fantastic success.

1. Create the "Marvel" Die, **Letter** `m`, with a "Marvel" counter.
2. Add 6 faces. On the first one, set **Shown as** to "M", **Value** to 6, and the Marvel counter to 1.
3. Leave **Value** empty on faces 2 to 6: they're worth their position (2, 3, 4, 5, 6).
4. The Roll is written `2d6+1dm`: the Marvel face does add 6 to the total.
5. The "Fantastic success" Outcome (Outcomes family) combines a success with a Marvel counter of at least 1.

### Tables

A Table turns a roll into a result. You choose its **Roll** and an optional **Bonus Formula**, then describe its **Rows**. Each row covers a range (**From** and **To**, left empty for an open range), gives a **Result** in words and runs the Actions ticked in **Actions run**. An Action rolls on the Table through its **Then roll on Table** field, after its Effects.

#### Critical wounds in Warhammer Fantasy 4e

A critical hit to the head is resolved on a d100 table, where some rows make the target bleed or knock them out.

1. Open **Rules > Tables** and create "Critical wounds: head". **Roll**: "1d100" (Rolls family). **Bonus Formula**: "No bonus".
2. Click **Add a row** for each range from the book, for example **From** 1 **To** 10 with its **Result**, and so on up to 100.
3. On each row, tick what it causes under **Actions run**, for example an Action that applies the "Bleeding" state to the target.
4. Create the "Head critical" Action with **Then roll on Table** set to this Table.
5. In the attack Action, under **On each outcome**, have the "Critical" outcome tick "Head critical" in **Then run these Actions**.
6. Ranges must not overlap. You need to type in the book's text yourself.

#### Bouts of madness in Call of Cthulhu

When an investigator snaps, a d10 decides what form their temporary insanity takes.

1. Create the "Bout of madness" Table. **Roll**: "1d10".
2. Add ten single-value rows (**From** 1 **To** 1, **From** 2 **To** 2…), each with its **Result**: amnesia, paranoia, flight…
3. For rows with a game effect, tick an Action under **Actions run**, for example an Action that applies the "Phobia" state.
4. Create the "Temporary insanity" Action, with **Then roll on Table** set to "Bout of madness".
5. To roll on the Table automatically, a Trigger (Orchestration section) can run "Temporary insanity" when the "Sanity loss" event happens.

#### The initiative deck in Savage Worlds

Every round, each character is dealt a card, and a Joker gives a bonus.

1. Create the "Initiative deck" Table. **Roll**: "1d54" (the field is required, but initiative draws a row directly).
2. Add 54 rows, one per card, each with a unique value that follows the card order, suit included: from the 2 of clubs (**From** 1 **To** 1) to the Ace of spades (52), then the two Jokers (53 and 54).
3. On the Joker rows, tick the "Joker" Action under **Actions run**. It runs when the Joker is drawn.
4. In **General**, click **Edit Ruleset**, open **Combat and shared resources**, then under **Combat initiative** choose this Table in **Initiative roll** and tick **Reroll each round**.
5. A drawn card doesn't come back in the same round, just like a real deck. The initiative equals the row's **To** value (or **From** if **To** is empty).

### Description scales

A Description scale replaces a number with words on a sheet. You choose what its ranges compare (**Ranges compare**: "the value" or "the % of the maximum"), then click **Add a band** for each range (**From**, **To**, **Description**). You then link it to a Definition type or to a Definition (the **Description scale** field). On the sheet, set a value block's **Shown as** to "As a description". In the sheet editor's **Add** tab, "Description (descriptive scale)" adds such a block directly, and each Definition family with scales is also offered as a list of its words.

#### Health status in Real World Fantasy

Other players don't see a character's Vitalité, only how they look.

1. Open **Rules > Description scales** and create "Health status".
2. **Ranges compare**: "the % of the maximum".
3. **Bands**: 100 and above "Looks in perfect shape", 75 to 99.99 "Slightly hurt", 50 to 74.99 "Hurt", 25 to 49.99 "In bad shape", 0.01 to 24.99 "Critical condition", up to 0 "Coma, dead or stabilized".
4. In the "Vitalité" Definition, set the **Description scale** field to "Health status".
5. On the sheet, add a second Vitalité block with **Shown as** "As a description", seen only by observers (**Seen by**): they read the words, never the number.

#### The Fate adjective ladder

Fate gives every level a name: +4 is Great, 0 is Mediocre, −1 is Poor.

1. Create the "Fate ladder" scale. **Ranges compare**: "the value".
2. Add one band per level, with the same value in **From** and **To**: 8 "Legendary", 7 "Epic", 6 "Fantastic", 5 "Superb", 4 "Great", 3 "Good", 2 "Fair", 1 "Average", 0 "Mediocre", −1 "Poor", −2 "Terrible".
3. Leave **To** empty on Legendary and **From** empty on Terrible to cover the extreme values.
4. Link the scale to the "Skill" Definition type, so every skill uses it. A single Definition can keep "That of its type" or pick a different one.
5. On the sheet, each skill block with **Shown as** "As a description" shows "Good" instead of "3". The "Skill · descriptions" item of the **Add** tab lists every skill with its word.

#### Characteristics in Call of Cthulhu

For an NPC, the GM describes Strength or Intelligence in words rather than as a percentage.

1. Create the "Characteristic level" scale. **Ranges compare**: "the value".
2. **Bands**, for example: up to 15 "Very weak", 16 to 40 "Weak", 41 to 60 "Average", 61 to 80 "High", 81 to 95 "Remarkable", 96 and above "Exceptional".
3. Link it to the "Characteristic" Definition type.
4. On the NPC sheet, show the characteristics with **Shown as** "As a description" for the players (**Seen by**) and as numbers for the GM only.
5. For the state of a gauge such as Sanity, use "the % of the maximum" instead: the words then follow each character's own maximum.

## Orchestration

### Permissions

A Permission decides who can read, write or run what. The GM always keeps every right. The engine checks reading and writing Definitions, writing a character's Content, and running Actions. When several policies apply, the one with the most precise scope wins: first a specific object ("Definition: …", "Content: …", "Action: …"), then a type ("Definition type: …", "Content type: …"), then a whole family ("All Definitions", "All Contents", "All Actions"), and finally the whole Ruleset.

#### Secret societies in Paranoia: information only its player can see

In Paranoia, each Troubleshooter hides their secret society from their teammates. The teammates must not read it, even if they can see the character sheet.

1. In the Permissions family, create an entry and give it a **Name**, for example "Hidden secret society".
2. In **Scope**, choose "Definition: Secret society" (the Definition already exists in the Definitions family).
3. Leave **Default effect** on "Deny" and tick **Enabled**.
4. Under **Rules**, click **Add rule**: **Effect** "Allow", **Operations** "Read", **Minimum ownership** "Owner".
5. Teammates, who only have Observer level on this character, no longer receive this value on the sheet. Since no rule allows "Write", the player can't change it either: only the GM can.

#### The Cthulhu Mythos skill in Call of Cthulhu: only the Keeper raises it

Players never give themselves Cthulhu Mythos points. The Keeper awards them after a reading or an encounter.

1. Create a Permission named "Mythos is for the Keeper", with **Scope** "Definition: Cthulhu Mythos" and **Default effect** "Deny".
2. First rule: **Effect** "Allow", **Operations** "Read", **Minimum ownership** "Observer". Everyone who can see the sheet can read the value, as usual in Foundry.
3. Second rule: **Effect** "Deny", **Operations** "Write", **Roles** "Player" and "Trusted player", **Message when denied** "Only the Keeper awards Cthulhu Mythos."
4. A player who tries to change the value sees this message. Be careful: the denial also applies to any Action the player runs that would write to this Definition. So Mythos gains have to go through an Action the Keeper runs personally.

#### Shaken in Savage Worlds: a Condition that blocks every Action but one

A Shaken character can't do anything except try to recover with a Spirit roll.

1. In the Conditions family, create the Condition "Shaken", true when the character has the Shaken status.
2. Create a Permission "Shaken can't act", with **Scope** "All Actions" and **Default effect** "Allow".
3. Add a rule: **Effect** "Deny", **Operations** "Execute", **Condition** "Shaken", **Message when denied** "You are Shaken: recover first."
4. Create a second Permission "Recovering is still allowed", with **Scope** "Action: Recover", **Default effect** "Allow", and no rules.
5. This second policy targets one specific Action. Its scope is more precise than "All Actions", so it is the one that decides for "Recover".

#### Characteristics in Real World Fantasy: a whole type reserved for the GM

In Real World Fantasy, characteristics stay stable: only the GM changes them, but everyone can read them.

1. Create a Permission "Characteristics are GM-only", with **Scope** "Definition type: Characteristic" and **Default effect** "Deny".
2. First rule: **Effect** "Allow", **Operations** "Read".
3. Second rule: **Effect** "Allow", **Operations** "Write", **Roles** "Assistant GM".
4. The policy covers every characteristic, including ones created later. A Permission on one specific characteristic is still more precise, so it decides for that characteristic.

In the same way, a Permission with **Scope** "Content type: Power" and **Default effect** "Deny", with no write rule for players, stops players from adding or removing powers themselves: only the GM hands them out.

### Event Types

An event type describes something that happens in the game. An Action emits it when you tick it in the Action's **Events triggered** (Actions family). Triggers, and Durations set to "Until an event", react to it. When an Action emits the event, the event always carries the Action used and the key of the Outcome it produced, and the **Only when** section of a Trigger offers "Outcome key". Each field you add under **Payload fields** gets an identifier based on its name, shown on the field. A Condition or a Formula reads it at event.payload.<identifier>. The Action that emits the event fills in these fields in its **Content of the events emitted** section. The event's roles are those of the Action: the Trigger chooses who acts. On top of that, the module emits its own combat and time events, without you creating anything.

#### The long rest in D&D 5e: an event that ends effects

Many D&D 5e effects last "until you finish your next long rest".

1. In the Event Types family, create an entry with the **Name** "Long rest" and tick **Enabled**.
2. Don't add anything under **Payload fields**: the fact that it happened is enough.
3. In the Actions family, open the "Take a long rest" Action and tick "Long rest" in **Events triggered**. The event concerns the character who rests.
4. In the Durations family, create "Until the long rest" with **Mode** "Until an event" and **Event Type** "Long rest". Every status that uses this Duration ends when the character rests.

#### Bestial failures in Vampire: The Masquerade V5: reading the Outcome from the event

When a roll ends in a bestial failure, the Beast takes over and the character suffers a Compulsion.

1. Create the event type "Roll resolved", with no fields.
2. Tick "Roll resolved" in the **Events triggered** of every Action that makes a Test with Hunger dice.
3. In the Outcomes family, the bestial failure has the **Result key** "bestial-failure".
4. Create a Trigger on "Roll resolved" that runs the "Suffer a Compulsion" Action (see the Triggers family). In its **Only when** section, choose **Payload field** "Outcome key" and **Equals** "bestial-failure".
5. A single event type now serves every Action and every Outcome, without creating any Condition.

#### Sanity loss in Call of Cthulhu: an event that carries a number

An investigator who loses 5 or more Sanity points in a single roll falls into temporary insanity.

1. Create the event type "Sanity loss". Under **Payload fields**, add a field with **Name** "Loss" and **Value type** "Whole number". Once you save, the field shows its identifier: loss.
2. In the Actions family, open "Sanity roll" and tick "Sanity loss" in **Events triggered**.
3. The **Content of the events emitted** section appears. For "Loss", choose the "Loss suffered" Formula, the same one the Action's Effect already subtracts from Sanity. It is calculated once the Effects have been applied. A field can also take a **Fixed value**.
4. In the Conditions family, create "Big loss", true when the **Context value** event.payload.loss is greater than or equal to 5.
5. Create the Trigger "Temporary insanity" on "Sanity loss", with the "Big loss" Condition and the "Temporary insanity" Action (see the Tables family). To check for an exact value, the **Only when** section is enough: **Payload field** "Loss", **Equals** "5".

#### Module events in Real World Fantasy: combat and the passage of time

In Real World Fantasy, each combatant loses 1 Endurance every three rounds, and each day that passes restores 1 Vitalité.

1. There is nothing to create in Event Types: the module provides "Combat starts", "New round", "Turn starts", "Combat ends" and "Time elapsed". They appear directly in a Trigger's **Event Type** field.
2. "New round" carries the Combat and Round fields. "Turn starts" adds Turn and Pass, and only concerns the combatant whose turn it is. Pass is the initiative pass being played (1 when the Ruleset has no passes), so a Condition can read event.payload.pass to act only on the first pass.
3. "Time elapsed" carries Seconds (the time that passed), Days (the number of midnights crossed) and World time.
4. For Endurance, the "Every three rounds" Condition reads event.payload.round and checks that the remainder of its division by 3 is 0. The "Winded in combat" Trigger listens to "New round" with this Condition.
5. For Vitalité, the "Daily recovery" Trigger listens to "Time elapsed" and runs the "Recover" Action.
6. For a simple equality check, you don't need a Condition: a Trigger's **Only when** section accepts, for example, **Payload field** "Round", **Equals** "1".

### Triggers

A Trigger listens for an event type, checks its Conditions, then runs its Actions. It chooses **Who acts** (whoever caused the event, or whoever was targeted), **Heard by** (each character concerned, the combat, or the world) and **When it happens** (automatically, or offered to the player in a reaction window).

#### The Shield spell in D&D 5e: a reaction offered to the player

When an attack hits a wizard, they can spend their reaction to gain +5 AC, which may turn the hit into a miss.

1. In the Actions family, set up the "Shield" Action. In **Reroll**, tick **Rerolls another Action** and **Keep the same dice**, then tick "Attack" in **Actions it can reroll**. In **Modifiers applied**, tick "Shield: +5 AC". Its **Cost Effects** spend the reaction and a level 1 spell slot.
2. The "Attack" Action ticks the "Attack made" event type in its **Events triggered**.
3. In the Triggers family, create "React with Shield": **Event Type** "Attack made", **Who acts** "The one it aimed at (reaction)", **Heard by** "Each character concerned", **When it happens** "Offered to who acts".
4. In **Only when**, choose **Payload field** "Outcome key" and set **Equals** to the key of the hit Outcome, for example "hit". In **Conditions**, tick "Reaction available" and "Knows Shield". These Conditions read the defender as self.
5. In **Actions**, tick "Shield".
6. In play, the defender's player sees the "Reaction" window with a "Shield" button and a "Let it pass" button. If they pick Shield, the attack is rerolled with the same dice against the new AC.

#### Bleeding in Warhammer Fantasy 4e: an automatic effect every round

A bleeding character loses 1 Wound every round.

1. In the Actions family, create "Bleed", whose Effect subtracts 1 from the character's Wounds.
2. In the Conditions family, create "Is bleeding", true when the character has the Bleeding status.
3. Create the "Bleeding" Trigger: **Event Type** "New round", **Who acts** "The one who caused the event", **Heard by** "Each character concerned", **When it happens** "Automatically".
4. In **Conditions**, tick "Is bleeding". In **Actions**, tick "Bleed".
5. When the round changes, the module emits the event for each combatant. Only those who are bleeding lose a point, and nobody has to click anything.
6. For an effect that only hits the active combatant, choose "Turn starts" instead.
7. To mark a character at 0 Wounds as defeated, pick an "Out of action" Condition in **Defeated when** (**General** > **Edit Ruleset** > **Combat and shared resources**; the field appears once an **Initiative roll** is chosen). The combat tracker and the token show the mark while the Condition holds, and it goes away after healing.

#### The Mörk Borg calendar: a countdown kept by the world

In Mörk Borg, the world is racing toward its end: the GM secretly counts down the days until the next Misery.

1. In **General**, click **Edit Ruleset**, open **Combat and shared resources**, and under **Shared resources** tick the "Days until the Misery" Definition in **World resources**. It exists only once for the whole table, outside the characters.
2. In the Formulas family, create "Days elapsed", which reads the **Context value** event.payload.days.
3. In the Effects family, create an Effect that **Applies to** "World", on "Days until the Misery", with the "Subtract" operation and the "Days elapsed" Formula. The "Time passes" Action applies it.
4. Create the "Calendar of Nechrubel" Trigger: **Event Type** "Time elapsed", **Heard by** "The world, once", **When it happens** "Automatically", **Actions** "Time passes".
5. Each time the GM moves Foundry's world clock forward, the counter drops by the number of midnights crossed. It happens once, not once per character. The GM follows it from the **Shared resources** button of the combat tracker. To keep it secret, give "Days until the Misery" a Permission with **Default effect** "Allow" and one rule that denies "Read" to the "Player" and "Trusted player" roles: players no longer see it there.
6. For a resource that belongs to each combat, tick it in **Resources of each combat**, make the Effect apply to "Combat in progress", and choose **Heard by** "The combat, once" with "Combat starts" or "New round".

## Systems

### Creation Systems

#### Point buy for ability scores in D&D 5e

The player has 27 points to buy their six ability scores, which start at 8. Each point up to 13 costs 1, and the points that take a score to 14 and to 15 cost 2.

1. In the Formulas family (Rules section), create "Cost of a point-buy point". It reads the "Context value" `variables.allocation.point`, which is 1 for the first point placed on an ability score, 2 for the second, and so on. It must equal 1 for points 1 to 5 and 2 for points 6 and 7. Choose the **Operation** **Table of ranges**, with this path as the **Value**, a first row with **To** `5` and **Outcome** `1`, and a second row with **From** `6` and **Outcome** `2`.
2. In Creation Systems, create the system, give it a "Name", then click "Add step".
3. First step, "Base": "Kind" Content, "Ruleset source" Content templates, and in "Allowed content templates" a piece of content that sets all six ability scores to 8. You prepare this content in the Content section.
4. Second step, "Ability scores": "Kind" Point allocation, "Ruleset source" Definitions, then tick the six ability scores in "Allowed Definitions".
5. Set "Minimum" and "Maximum" to 27, and "Cost of each point" to the Formula from step 1. When there is a cost, these two limits count the total cost instead of the number of points.
6. Set "Points per target at most" to 7: no ability score can then go above 15.
7. Last step, "Review": "Kind" Review, "Minimum" 0 and "Maximum" 0. Here the player looks over their character before clicking "Create the character".

#### Rolled species and characteristics in Warhammer Fantasy 4e

The species is rolled on a table (90% humans, then halflings, dwarfs and elves), and each characteristic equals the species' base plus 2d10.

1. In the Content section, give the "Species" content type a number field called "chance". Each species stores its weight there (90 for Human, 4 for Halfling, 4 for Dwarf, 1 for each elf) and sets its characteristics to their base, for example 20 for a human.
2. In the Rolls family (Rules section), create a "2d10" Roll.
3. "Species" step: "Kind" Content, "Ruleset source" Content templates, then tick the five species. Set "Minimum" and "Maximum" to 1.
4. Set "Random draw" to "Drawn, can be changed" and type `chance` in "Chance from the data field". The player clicks "Draw at random" and can still change their mind. The step does not calculate the XP bonus that Warhammer gives to players who keep their roll: you handle that separately.
5. "Characteristics" step: "Kind" Point allocation, "Ruleset source" Definitions, then tick the ten characteristics in "Allowed Definitions".
6. Set "Random draw" to "Drawn, final" and "Roll for each Definition" to the 2d10 Roll. Each characteristic gets its own roll, which is added to the base set by the species. The player can't change it any more, and the "Minimum" and "Maximum" limits don't apply to rolled points.
7. Each species also lets the player pick some skills. Set these up under "Acquisition choices" on each species, then add a "Choices of the Contents" step and tick "Species" in "Choices of the steps". The player picks the species skills on their own screen. The step is skipped when the chosen species has no choice.

#### Career-based creation in Traveller

The character goes through four-year terms: they choose a career, roll for survival, and only start a new term if they survived, up to seven terms.

1. In the Content section, create one piece of content per career (Marine, Merchant, Scout…). Each one grants its skills and has a number field called "survie", the target number to reach.
2. "Career" step: "Kind" Content, "Ruleset source" Content templates, tick the careers, then set "Minimum" and "Maximum" to 1. Leave "Identifier" empty: it will be derived from the name, here `carriere`.
3. "Survival" step: "Kind" Roll and "Roll" 2d6, a Roll created in the Rolls family. The step's other settings disappear: a roll step is rolled once. Its identifier will be `survie`. Save: each step now shows its "Identifier", with a button to copy it.
4. In the Conditions family, create "Survived". It compares two "Context value" entries: `variables.creation.survie.total` must be greater than or equal to `variables.creation.carriere.fields.survie`.
5. Go back to the "Survival" step, the last one in the block, and type 2 in "Repeat the last steps". "Career" and "Survival" now make up one term.
6. Set "Terms at most" to 7 and "Another term while" to the "Survived" Condition.
7. In the creation window, the player sees "Term 1", then clicks "Another term" as long as the Condition stays true. An optional step can also have a "Required condition", for example a Condition that reads `variables.term.index` so that the step only comes up from the fourth term onward.

### Progression Systems

#### Buying attribute dots with XP in Vampire: The Masquerade V5

Raising an attribute costs five times the new level in XP, up to a maximum of 5.

1. You need an "Experience" Definition whose base value or pool serves as the currency (Definitions section).
2. In the Formulas family, create "Attribute cost", which multiplies the "Context value" `variables.advance.next` (the target level) by 5. Also create a "Five" Formula that simply equals 5.
3. In Progression Systems, create the system, give it a "Name", then click "Add an advancement".
4. Fill in "Label" ("Attribute"), then "Raises Definitions of type": Attribute. Leave "Raised by" at 1.
5. "Paid with": Experience. "Cost": "Attribute cost". "Highest value": the "Five" Formula.
6. Add a second advancement, "Skill", on the Skill type, with a cost Formula that multiplies by 3.
7. Players buy advances themselves on the sheet. The automatic sheet shows a section named after the system. In the sheet editor, you add the system from "Add", in the "Fields" group. Each attribute the character has appears there with its current level, the target level, the XP cost and a "Buy" button. If there isn't enough XP, or the value is already at its highest, the row says so instead of showing the button. Each purchase posts a card in the chat.
8. To try it out without a player, "Try the rules" includes the Progression tool and its "Buy" button.

#### Improvement Points in Cyberpunk RED

Raising a skill costs 20 IP times the target level, and double that for difficult skills such as Evasion or Pilot Air Vehicle.

1. Create an "Improvement Points" Definition to serve as the currency. Put ordinary skills in a Skill type and difficult skills in a Skill ×2 type (Definitions section).
2. Create two Formulas: one multiplies `variables.advance.next` by 20, the other by 40.
3. First advancement, "Skill": "Raises Definitions of type" Skill, "Paid with" Improvement Points, "Cost" the ×20 Formula.
4. Second advancement, "Difficult skill": "Raises Definitions of type" Skill ×2 and "Cost" the ×40 Formula. To target only two or three specific skills, leave the type empty and tick them in "Or these Definitions".
5. In both advancements, set "Highest value" to a Formula that equals 10.
6. An advancement's "Condition" field can also block a purchase, for example while an "In downtime" Condition is false.

#### Levelling up in D&D 5e

At 300 XP, the fighter reaches level 2 and gains Action Surge. At level 4, they choose an Ability Score Improvement or a feat.

1. In the Conditions family, create "300 XP or more", which compares the character's XP to 300, then one Condition per threshold (900, 2,700…).
2. In the progression system, click "Add a milestone".
3. "Label": Level 2. "Reached when": "300 XP or more". In "Grants", tick the "Action Surge" Definition.
4. Add a "Level 4" milestone, with "Reached when" set to the 2,700 XP Condition. In "Then runs", choose an "Improvement or feat" Action. Its choices, set up in the Actions family, let the player decide.
5. Each milestone applies only once per character. On the sheet, the system's block lists the milestones already applied, the ones waiting to be applied, and the next one. The "Apply the milestones reached" button applies, in one go, every milestone whose Condition has become true, after asking the player for the choices of their Actions (the level 4 feat). "Try the rules" (Tools section) gives the GM the same button.

### Sheets

The sheet editor shows the sheet in the middle and a side panel with three tabs: **Block** (the settings of the selected block, in Content, Display and Access groups), **Add** (what you can put on the sheet) and **Theme** (the sheet's look). The "Sheet" section at the top holds its name, what it is used for and whether it is enabled.

#### Attribute dots in Vampire: The Masquerade V5

The nine attributes are shown as dots from 1 to 5, and the player clicks a dot to set the level.

1. In Sheets, create the sheet: "Name", "Used for" Actors, then tick "Enabled".
2. In the **Add** tab, click the Attributes family under "Definition families". A "List of Definitions" block appears in the selected block.
3. Click the list and set "Columns" to 3 to get the three columns: Physical, Social and Mental.
4. Click the row's value: "Shows" The listed Definition's, "Which one" its value.
5. "Shown as": Dots. If the Attribute type has a maximum of 5, the dots stop at 5 on their own. Otherwise, set "Dots (without a maximum)" to 5.
6. "Dot color": Danger, for a blood red. In "On the sheet", tick "Typed in": clicking a dot sets the level.
7. On the section that holds the list, set a "Title" and an "Icon", for example `fa-solid fa-droplet`, with "Label shows" Icon and text.

#### Hit points and "bloodied" in D&D 5e

The player and the GM see the exact hit point gauge, while other players only see words like "Bloodied".

1. In the Description scales family (Rules section), create a scale where "Ranges compare" the % of the maximum. Add bands with "From", "To" and "Description": "Unhurt" from 100, "Wounded" from 50 to 99.99, "Bloodied" from 0.01 to 49.99, "Down" up to 0. Choose it in the "Description scale" field of the Hit points Definition.
2. On the sheet, add a "Gauge" from the "Fields" group of the **Add** tab. In **Block**, set "Shows" A Definition output and "Which one" the current hit point pool.
3. "Gauge color": Danger, "Gradient to": Success.
4. "On the sheet": tick "Can be raised" and "Can be lowered". The sheet then shows − and + around the gauge.
5. "Seen by": keep "Players (owners)" and "The GM", and untick "Observers".
6. Add "Description (descriptive scale)" from the same group. It starts on a Definition that has a scale: pick the hit points in "Which one", then leave only "Observers" in "Seen by". The number is never sent to them.
7. In the toolbar, "View as" An observer lets you check what they will see.
8. To show hit points on the token too, open the token's configuration and pick "Hit points" in the "Rule Them'All" group of a bar's attribute. The bar follows the pool but can't be changed from the token.

#### The crew sheet in Blades in the Dark

The crew has its own sheet, separate from the scoundrels' sheets, and the GM keeps track of its Heat.

1. Create two Actor sheets: "Scoundrel sheet" and "Crew sheet".
2. On the crew sheet, add a value for Heat (a pool with a maximum of 9), with "Shown as" Dots, or Clock for a progress clock.
3. "On the sheet": tick "Can be raised" and "Can be lowered". "Changed by": tick "The GM only". Players can see the Heat, but only the GM gets the − and + buttons.
4. Add an "Action button" pointing to an "Acquire an asset" Action (Actions family), with the "Icon" `fa-solid fa-coins`.
5. In Foundry, open the crew's Actor, then the sheet configuration in its header. Choose "Crew sheet": every enabled sheet is listed there by name.
6. The generic "Rule Them'All sheet" entry picks the first enabled sheet that fits. For the crew, choose the sheet by its name instead.

#### A gothic look for Mörk Borg (sheet themes)

Every character sheet should look like a page torn from the same grim book.

1. Open the character sheet and its **Theme** tab. In "Theme", choose "Gothic" (the others are Parchment, Science fiction and Plain).
2. Adjust the colors ("Page", "Sections", "Text", "Titles and highlights", "Frames", "Fields") and the "Text font" and "Title font". "Section frame (picture)" can put an image frame around each section.
3. Click "Save as theme" and name it "Mörk Borg". Every sheet of this Ruleset can now take it from the same "Theme" list.
4. To change it later, adjust the look and save it again under the same name: every sheet that uses it follows. A sheet can still change a color for itself on top of the saved theme. "Export as a file" and "Import a theme…" carry a theme to another Ruleset.

## Tags

Tags sort and filter the cards in the Configurator. You create and edit them under **Tools > Tags**. You can put them on almost every object in the Ruleset, except Definition Types, Permissions and tags themselves. Right-click a card, then "Tags…", to tick or untick its tags, or to create a new one by typing its name in "New tag".

#### Schools of magic in D&D 5e

Each spell belongs to a school (Abjuration, Evocation, Necromancy…), which lets you quickly find the spells of a specialist wizard.

1. In **Tools > Tags**, create one tag per school, or do it as you go: right-click a spell, choose "Tags…", then type the school in "New tag".
2. On each spell, which is a content template (Content section), tick its school in "Tags".
3. In the list of spells, the "Filter" area shows one chip per school, with the number of spells. Click "Evocation" to keep only those spells, then "Clear filters" to see everything again.
4. A tag is only for sorting: no Formula or Condition reads it.

#### Basic and advanced skills in Warhammer Fantasy 4e

Basic skills can be used without training, while advanced skills need training.

1. Create two tags, "Basic skills" and "Advanced skills", each with its own color.
2. Open each skill in the Definitions section and tick the right tag in "Tags".
3. In the list of Definitions, the "Filter" chips split the two groups. This is handy for checking that no skill has been forgotten.

#### Cyberware families in Cyberpunk RED

The cyberware catalog is sorted by location: Cyberlimbs, Neuralware, Cyberoptics, Internal Body, External Body.

1. Create one tag per cyberware family.
2. On each implant (a content template), tick its family in "Tags". An implant can have several if needed.
3. With dozens of implants, filter by "Neuralware" before adjusting the prices or the Humanity loss of a single family.
4. If a rule has to depend on the family, for example a cap on neural implants, store that information in a field of the content type (Content section). Formulas read fields, not tags.

#### Concentration and Ritual in D&D 5e

Some spells require concentration, others can be cast as rituals, and the GM wants to spot them at a glance.

1. In **Tools > Tags**, create "Concentration" and "Ritual". Give each one a "Color" by ticking "Customize" (otherwise the tag takes the color of the Tools section).
2. Open each spell concerned and tick the tag in "Tags". Find it with "Search tags…".
3. In the list of spells, each card shows its tags in color. The "Filter" chips let you keep only the concentration spells.
4. A tag doesn't change the rules. To make a concentration spell end when you cast another one, you need an actual rule, with Triggers and Durations.

#### The main domains of Shadowrun

Shadowrun mixes magic, the Matrix and riggers, and a single domain touches Definitions, Actions, Tests and Effects.

1. Create the tags "Magic", "Matrix" and "Rigging", each with its own color.
2. On a Formula, a Condition or a Test, open "Notes and tags" and tick the tag in "Tags". Content templates have their "Tags" list directly in the editor.
3. In **Tools > Dependencies**, click the "Matrix" chip under "Filter by tags" to keep only the objects from that domain. This helps you gauge the scope of a rework.

#### Third-party content in Mörk Borg

Mörk Borg has a huge third-party supplement scene, and the GM wants to see at a glance what comes from the core book.

1. Create a brightly colored "Third-party content" tag, and a "To review" tag for work in progress.
2. Tick "Third-party content" on every class, weapon or spell that comes from a supplement.
3. To share a supplement with another table, filter on its tag, Ctrl+click each card to select it, then click "Export the selection". The dialog lists what the selection needs: untick what the other Ruleset already has.
4. Tick "Export as an extension" and set its "Extension version". The other GM installs it with "Import a part…", updates it with the next version, and can remove it from "Installed extensions" in General.
