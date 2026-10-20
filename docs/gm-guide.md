# Rule Them'All: GM guide

Rule Them'All is a module for Foundry VTT v14. You describe a tabletop RPG's rules in a **Ruleset**, then play them in any world, whatever game system is installed. The module doesn't replace the system: it stores its own data in the flags of Actors and Items, and offers its own sheets alongside the system's.

This guide follows the order you set things up in: install, build or import a Ruleset, publish it, activate it, then play.

For step-by-step examples, grouped by family and taken from well-known games, see [configuration-examples.md](configuration-examples.md).

## 1. Install and open the module

1. Install the module, then enable it in your world (Manage Modules).
2. Open **Game Settings → Configure Settings → Rule Them'All → Open Rule Them'All**. Only a GM can configure it.

This opens the **Configurator**. It lists the world's Rulesets, then lets you work on the one you pick.

## 2. Ruleset versions

A Ruleset has one or more versions. Each version has a status:

| Status | What you can do |
| --- | --- |
| **Draft** | Change anything. A draft can be incomplete; it can't be played. |
| **Published** | Playable. You can still edit it: it keeps the same identifier when you publish, so Actors stay linked to it. |
| **Validated** | Locked and read-only. To change it, create a new version. |

What you can do with a version:
- **Publish** checks that nothing is missing. The General section shows what still needs filling in; click an item to jump to the field to fix.
- **Activate** picks the version played in the world. Only one version is active at a time.
- **Export** downloads the version as JSON; **Import** (from the Ruleset list) loads it into another world. To export only part of it, see [Exporting and importing part of a Ruleset](#exporting-and-importing-part-of-a-ruleset).
- **Create New Version** starts from an existing version.

Ready-to-import Rulesets live in the repository's [Rulesets](../Rulesets/) folder: [Real World Fantasy](../Rulesets/rwf/LISEZMOI.md) and [SRD 5.2](../Rulesets/srd-5.2/LISEZMOI.md) (5th edition, 2024 rules). When you drag a creature from an Actor-type Content compendium onto the scene or into the Actors directory, it takes the values, actions and items of its template.

### Moving Actors to a new version

When you replace one version with another (for example, importing RWF 1.3.0 to replace 1.2.0):
1. import the new version, publish it if needed, then activate it;
2. open each Actor: its sheet header offers **Move to …**. The module keeps whatever the new version still defines, removes the rest, and grants whatever the held Contents now grant;
3. delete the old version once every Actor has moved.

If you delete the old version first, the Actor's sheet tells you so and offers the same button.

## 3. Building a Ruleset

The Configurator organizes the Ruleset into sections. Each element is a card: click it to open it, or **right-click** it for Edit, Export, Duplicate (you're asked to name the copy) and Remove (with a confirmation that shows what uses it).

### Definitions
- **Definition Types**: the game's families (attributes, skills, resources, conditions…). A type sets what its Definitions can do (hold a value, a pool, a condition…), and can carry **value bounds** (a minimum and maximum, either fixed or computed by a Formula).
- **Definitions**: each element of a family (Strength, Climbing, Hit Points…). A Definition can override its type's bounds.

### Content
- **Content Types**: weapons, powers, backgrounds, equipment… A Content becomes a Foundry Item when an Actor receives it.
- **Content**: the elements themselves. They grant Definitions, conditions and modifiers, and can ask for choices when acquired.

### Rules
- **Parameters**: the Ruleset's constants (a cap, a cost).
- **Formulas** and **Derived Outputs**: the calculations (a final value, a bonus, a threshold).
- **Conditions**: true/false tests ("the Actor is a PC", "the target is in range").
- **Rolls**, **Outcomes** and **Tests**: how dice are rolled and how the result is read (success, failure, degrees).
- **Effects**, **Modifiers** and **Durations**: what changes on an Actor, and for how long. An Effect can also write to a numeric field of the Content being used ("Field of the Content used: Ammunition"), and later Effects in the same Action can read what it did from `variables.effects.<id>` (`before`, `after`, `operand`). That way, reloading takes exactly what went into the magazine out of the pool.
- **Actions**: what you do from a sheet (attack, cast a spell, rest). An Action chains a Test, Effects, choices after the result, and rerolls. Its **Chat card buttons** add a button under the result that runs another Action: "Apply damage" for the GM, "Defend" for each target, and so on. The button's Action reads the first result from `variables.previous` (total, margin, target, outcome, roll, natural).
- **Dice**: the game's own dice, rolled by their letter (for example `2dp`).
- **Tables**: random draws.
- **Description scales**: words instead of a number ("Fit as a fiddle", "Badly wounded").

### Orchestration
- **Permissions**: who can read, change or use what (GM, owner, observer).
- **Event Types** and **Triggers**: react to what happens in play (combat starts, a new round, time passes, an Action's result). A trigger can offer a reaction to the player concerned.

### Systems
- **Creation Systems**: character creation, step by step (choice, content, choices of the contents, point allocation, roll, summary). See section 5.
- **Progression Systems**: advancement (spending experience, milestones).
- **Sheets**: character and item sheets. See section 4.

### Tools
- **Tags**: to sort and filter cards. Right-click a card, then **Tags…**, to tick its tags or create a new one.
- **Dependencies**: a graph of what uses what. Handy before you delete something.
- **Try the rules**: a GM sandbox for trying out an Action, a Test or a Formula on an Actor, against the draft, without touching the game.

### Exporting and importing part of a Ruleset
You can export part of a Ruleset (a rule, a few cards, a family, a whole section) together with everything it needs, to back it up or hand it to another GM.
- **One card**: right-click it, then **Export…**.
- **Several cards**, even from different families: **Ctrl+click** (Cmd+click on Mac) each one, or right-click and choose **Add to the selection**. The number of selected cards shows at the top of the window, with the **Export the selection** and **Clear the selection** buttons.
- **A family or a section**: right-click its name in the left menu (for example *Actions*, or *Rules* for the whole section). A family of Definitions or Contents is exported with its type.

The export window lists, by family, what the part needs (an Action's Tests, the Formulas and Definitions they read, and so on). What's ticked goes into the file; what's unticked doesn't, so the receiving Ruleset must already have it (with the same identifier). For example, untick the attributes when the other GM plays the same Ruleset. A family's checkbox ticks or unticks the whole family.

To load a part, open the Ruleset that will receive it (a draft or a published version, not a validated one) and click **Import a part…** at the top of the window:
- if the Ruleset is missing something the part expects, the import is refused and you see a list of what's missing;
- identical elements are skipped, and new ones are added;
- for an element that already exists but differs, you choose: **Keep mine** (the part uses yours), **Replace with the file's**, or **Import as a copy** (it comes in under a different identifier, and the part's elements that use it follow along).

The world translations for the part's texts come with it and fill in those of the receiving Ruleset. A complete Ruleset is still always imported from the Ruleset list.

### Extensions
An extension is a part you install, update and remove as a single unit: for example, a "fantasy" supplement that adds its rules and contents to RWF.
- **Create one**: export the part as above, open **Extension (optional)** in the export window, tick **Export as an extension**, and give its version (1.0.0, then 1.1.0…) and the minimum Ruleset version. It's made for the Ruleset it was exported from (same Ruleset identifier) and is recognized by its name, so keep the same name for later versions.
- **Install it**: **Import a part…** recognizes an extension. It's refused by a different Ruleset, or by a version older than the minimum version. Conflicts with your own elements are settled the same way as for a part.
- **Update it**: import its new version the same way. Its own elements are replaced without asking, those the new version no longer has are removed, and an element imported as a copy keeps its identifier.
- **Remove it**: the **General** section lists installed extensions, each with a **Remove** button. Whatever it added is deleted, and whatever it replaced goes back to how it was. Removal is refused, with a list, as long as your own elements use something it added.

Cards that came from an extension show its name. An extension only adds or replaces whole elements.

## 4. Sheets

### Sheet editor
In **Systems → Sheets**, create an Actor or Item sheet (for specific Content Types, or for all of them). The editor shows the sheet as it looks in play. Its window is split into **three areas separated by vertical lines**, running full height, each with its own scrolling; the buttons (Remove, Cancel, Apply, Save & Quit) stay at the bottom:
- **on the left, the tools**, in three tabs: **Block** (the selected block's settings), **Add** (the palette) and **Theme** (the sheet's theme);
- **in the middle, the sheet**: the collapsible **Sheet** row (name, used for, header, window, description, file, enabled; open when you create the sheet, collapsed after that), then a bar that stays at the top as the sheet scrolls (toolbar, **View as**, **Preview** and the **?** help button), then the sheet itself;
- **on the right, the Layers**: the tree of the sheet's blocks.

Drag the line between a panel and the sheet to set the panel's width (double-click to restore it), and use its button to hide or show the panel; this choice is kept for all sheets. In a narrower window, the Layers move below the tools; in a narrow window, everything stacks into a single column. A sheet from a validated version only has the middle area.

When you hover, a light outline shows which block a click will select, both on the sheet and in the Layers. **Right-click** a block to select it and see its commands (copy, paste, duplicate, style brush, rename, save as template, default style, remove). **Double-click** a block to open the **Add** tab and add a block to it.
- the **palette** (Add tab) adds blocks (sections, tabs, grids, lists of a Definition family, values, gauges, dots, Action buttons, Progression Systems, images, texts) by click or drag and drop; it shows which block a click will add to;
- the **block settings** (Block tab) start with a breadcrumb trail (Sheet › Tabs › Character › …) where each step selects that parent, then are grouped into collapsible groups: **Content** (open: label, source, what the player can change…), **Display mode** (Font Awesome icon, text, icon or both, field, gauge, dots, width, tooltip…), **Access** (**Seen by** player, observer, GM; **Changed by: The GM only**; **Only when**) and **Style** (colors, font, margins);
- the **toolbar**, in groups: move up and move down | **copy**, **paste**, **duplicate** | **style brush** | remove | **undo** and **redo**; next to it, **View as** shows the sheet as a player, an observer or the GM will see it;
- **Copy / paste**: a copied block keeps its children and its style. When you paste it, it goes into the selected block if that block is a container that accepts it, otherwise right after it. The clipboard works across all sheets you open during the session, even from another Ruleset. A block that uses a Definition, a Formula, an Action… that this Ruleset doesn't have (or a Content field on an Actor sheet) is refused with a message;
- the **style brush** picks up the selected block's style, and every block you click afterwards receives it (anything that kind of block can't carry is left out). Press Esc or click the brush again to put it down;
- the **Layers** (right-hand area) list the blocks as a tree. When two blocks share a name, the tree shows what sets them apart ("Vitalité · gauge"), and small symbols flag a block that's hidden from some people (crossed-out eye), conditional (filter) or changed by the GM only (padlock). Click to select a block, double-click to rename a tab, section, value or button, use the arrow to collapse a container's contents, and drag a row to move its block (top or bottom of the row: next to it; middle of a container: inside it);
- **keyboard shortcuts** (outside text fields): Ctrl+C, Ctrl+V, Ctrl+D (duplicate), Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z (redo), Delete, Up and Down arrows (move), F2 (rename), Esc (deselect);
- **Preview** (in the bar above the sheet): narrow window, the sheet's window size, or full width;
- **Window (px)**: the width and height the sheet opens at in play (empty: Foundry's size).

A new sheet starts out empty.

### Header, name and images
- The sheet's **Header** option is either **Standard** (image and name at the top, as usual) or **None**. With None, you place the **Name** and **Portrait** blocks yourself (in the palette's "Name and images" group) wherever you like, styled however you like. On an Actor sheet, the **Token image** block shows the image its token uses on the scene. In the editor, these blocks show a sample silhouette.
- In play, a **padlock** in the window header locks the sheet, just like Foundry's own sheets. When it's locked (as it is when opened), you play: the name and images don't change. When it's unlocked, you can edit the name, and the **camera** button at the bottom right of a portrait opens Foundry's file picker. The sheet's values stay usable either way. Only people who can edit the Actor or Item see the padlock.
- For the token image, tick **Also update the tokens already placed** in the block settings: the Actor's tokens already on scenes change along with it.
- A Content Type or Definition Type where you untick **Offered in the sheet editor** (Creature, NPC…) no longer shows up in the palette; blocks already placed keep working.

### Block templates
- Select a block (an attribute section, a weapon block…), then click the **bookmark** next to its name in its settings: **Save as template** asks for a name. The template belongs to the Ruleset: it shows up in the palette's **Templates** group on every one of its sheets that can hold it (a template with a token image only goes on an Actor sheet, and a template of Content fields only on an Item sheet or in cards).
- Click a template to add it to the selected block, or drag it onto the sheet. The placed block is an **independent copy**: changing one doesn't change the template or the other copies.
- A template's small buttons in the palette **rename** it, **export** it to a file or **delete** it. If a template is refused when you insert it, it tells you what's missing (a deleted Definition, a field the sheet doesn't have…).
- You can't delete a Definition, Formula or Action that a template uses: the deletion check names the template, just as it does for a sheet.

### Contents as cards
A **Held Contents** block shows as **A list** or as **Cards** (the **Display mode** setting). As cards, each Content uses either:
- **Image, name and chosen fields**: its image, its name and the fields you tick in **Fields shown**;
- or a **card template**: a block template made of Content fields, Name and Portrait blocks (which then show the Content, not the Actor), texts and images. Build it on an Item sheet, save it as a template, then pick it under **Card**. A template that draws cards can't be deleted while a sheet uses it.
Each card keeps its **Open** and **Remove** buttons.

### Sheet theme
The tools' **Theme** tab dresses up the whole sheet: **Parchment**, **Gothic**, **Science fiction** or **Plain** (Foundry's colors, thin frames). For that sheet, you can then change the color of the page, sections, text, titles, frames and fields (the arrow resets it to the theme's color), the text and title fonts (Foundry's fonts and any added in its font settings), and set an image as the **Section frame (picture)**.

**Your own themes**: **Save as theme** stores the current look under a name, in the Ruleset. That theme then appears in the **Theme** list of every sheet in the Ruleset, after the module's own themes; a sheet that uses it can still change a color just for itself. When a sheet uses one of your themes, three buttons **rename** it, **export** it to a file or **delete** it (the sheet keeps its look). Saving under the name of an existing theme updates it for every sheet that uses it. **Import a theme…** adds a theme exported from another Ruleset. A theme used by a saved sheet can't be deleted, and an exported sheet takes its theme with it.
You can also put an **Image frame** on a single block (in the **Style** group of its settings): pick the image, the **Cut from the edges (px)** (how many pixels from each edge of the image make up the frame, 30 by default) and the **Frame width** (thin, medium, wide). The image must be a frame with an empty or plain center.

### Exporting and importing a sheet
The **File** row in the sheet's settings **exports** the sheet (layout, theme, settings and the card templates it uses) to a JSON file, and **imports** one, for example from another Ruleset. If the file uses elements this Ruleset doesn't have, they're listed, and you can import without the blocks that use them. You import a block template the same way, from the palette's **Templates** group. Check the imported sheet, then save; **Cancel** brings back the previous layout.

### Layout and dynamic blocks
- **Background picture** for a section, grid or tab (Style group): **Picture fit** can be Cover, Contain, Stretch, Original size or Tile, and **Picture position** can be Center, Top, Bottom, Left or Right.
- **Text area** (Fields group): free text over several lines, stored on the Actor (notes, backstory). Choose **Plain text** or **Rich text** (Foundry's editor: bold, links, @UUID, inline rolls), a height, **Seen by**, and **Changed by: The GM only**. Writing to it follows the Ruleset's Permissions, just like a value. Not available on an Item sheet or in a list.
- **Separator** (Layout group): a line, an ornament or an image.
- **More settings** (collapsed, on every block): **Rows spanned** (in a grid), **Fixed width** (small, medium, large) and **Tooltip**: free text, or for a value, **The Definition's description**.
- A section can be **Foldable**: clicking its title folds it in play, and each player finds their sections the way they left them.
- **Stack the blocks** (section, grid): blocks pile up in the same spot, at the top, in the middle or at the bottom, for example a value placed over an image.
- **Shown only if**: the block only shows when a Condition is true for the Actor (in a list: for each row). In the editor, such a block appears dimmed.
- **Insert a value** (Text block): pick a value, a Formula or a Parameter. Its name is added in curly braces, for example "Defense {Defense}", and the sheet shows the number in its place. Delete the name from the text to remove the value.
- **On click, use** (value, text, image, list): clicking the label, text, image or a row's name runs the chosen Action, for anyone allowed to use it.
- **Boxes** and **Clock** (Fields group): a value shown as checkboxes or as a segmented clock. Their number comes from the value's maximum, or otherwise from the block's setting.

### Choosing an Actor's sheet
Every enabled sheet of the active Ruleset appears under its name in **Configure Sheet** (in the header of the Actor or Item window). So you can have several PC sheets, an NPC sheet and a creature sheet, and choose one for each Actor, or a default for each Actor type.

"Rule Them'All sheet" only appears where the Ruleset has no sheet of its own; it then builds a sheet automatically.

## 5. Creating a character

The creation button is in the **Actors** tab. The player follows the steps of the Creation System, and their progress is saved if they close the window. An empty Actor opened with a Rule Them'All sheet also offers creation.

A Content's choices (two skills out of four for a profession, say) usually appear under the chosen Content. A **Choices of the Contents** step placed after a content step asks for them on a separate screen instead: in **Choices of the steps**, tick the steps it covers. The step skips itself when none of the chosen Contents has a choice to make.

During creation, the bonuses and penalties from each step add up before the value bounds apply, so an age penalty taken before the free points isn't lost at the minimum. The bounds apply to the finished character.

## 6. In play

- The sheet's **Action buttons** run the Action, ask for its inputs if it has any, and post a card to chat. Choices after the result are offered in a window.
- The card follows the **roll mode** selected in chat (public, GM, blind, private) and carries Foundry dice, so the dice tooltip and Dice So Nice work. On a blind roll, the player only sees the title.
- The **card buttons** only show for people who can use them: the GM, the character's player, or a target's owner.
- **Token bars** can show a Ruleset pool that has a maximum, or a bounded value: in the token configuration, pick it from the "Rule Them'All" group. The bars update on their own and can be changed from the sheet.
- A **Progression System** block shows what the Actor can buy (current and target level, cost, currency spent) with a button for each purchase, followed by its milestones and the "Apply the milestones reached" button. Players buy for themselves, without going through "Try the rules". When a Ruleset permission lets a player buy for an Actor they don't own, the purchase goes through the connected GM. An observer sees the costs but not the buttons.
- **Values** can be changed on the sheet within the Ruleset's limits (bounds, permissions). When a player changes an Actor they don't own, the change goes through the connected GM.
- Dragging an **Item** onto the sheet gives it to the Actor; a Content from the Ruleset then asks its choices and grants what it grants. Removing it takes back what it granted.
- **Combat**: the Ruleset's initiative, its passes and the round order are handled by Foundry's combat tracker. You set passes with an initiative threshold (Shadowrun) or with a "Passes of each combatant" Formula (RWF: as many passes as attacks); the "Turn starts" event gives the current pass in `event.payload.pass`. **Defeated when** picks a Condition (RWF: "Vitalité at 0"): as long as it's true for a combatant's Actor, that combatant is marked defeated in the combat tracker, with the status on its token; when it becomes false again, the mark is removed.
- **Shared resources** (the Ruleset's sheet, "Combat and shared resources" block): values tracked once for the whole game (GM pool, clocks) or once per combat (escalation die). The **Shared resources** button in the combat tracker shows them to everyone; the GM changes them with − / +.
- **World time** makes timed conditions expire.

## 7. Updating the module

Some updates change how the module stores its data. When that happens, the module can no longer read the old format and tells the GM when the world loads.

In that case, open **Game Settings → Configure Settings → Rule Them'All → Repair the data**. The window tells you whether anything needs repairing and lists what will change. **Repair** first downloads a backup, then converts the data. Reload the world afterwards.

## 8. For other modules

The API is available at `game.modules.get("rule-them-all").api` (and `game.ruleThemAll`):
- `configurator`: read and change Rulesets;
- `runtime`: Actor state, Actions, Tests;
- `content`: give and remove Contents;
- `creation`: character creations in progress.

The `ruleThemAllReady` hook signals that everything is ready.

A Foundry combat with the `rule-them-all.singlePass` flag (`combat.setFlag("rule-them-all", "singlePass", true)`) has only one pass per round, whatever the Ruleset's passes: useful for a chase or any scene that reuses the combat tracker.
