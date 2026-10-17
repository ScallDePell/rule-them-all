import {MODULE_ID, REGISTER_TYPES_HOOK} from "./src/core/module-contract.mjs";
import {engineRegistries} from "./src/configurator/operation-registries.mjs";
import {createConfiguratorAPI} from "./src/configurator/configurator-api.mjs";
import {ConfiguratorApp} from "./src/configurator/configurator-app.mjs";
import {WorldSettingStorage} from "./src/configurator/world-setting-storage.mjs";
import {createRuntimeAPI} from "./src/runtime/runtime-api.mjs";
import {FoundrySocketRelay} from "./src/runtime/runtime-relay.mjs";
import {CreationSessions, FoundryCreationSessionStore} from "./src/runtime/creation-sessions.mjs";
import {FoundryContentBridge} from "./src/runtime/foundry-content-bridge.mjs";
import {isOwningContentHook,guardOwnedContentCreation} from "./src/runtime/foundry-content-hooks.mjs";
import {combatChangeEvents, timeElapsedPayload} from "./src/configurator/system-events.mjs";
import {registerRulesetDice} from "./src/runtime/foundry-dice.mjs";
import {installInitiative, installInitiativePasses, rerollEachRound} from "./src/runtime/foundry-initiative.mjs";
import {FoundryRuntimeAdapter} from "./src/runtime/foundry-runtime-adapter.mjs";
import {registerRulesetSheets, repairSheetChoices, translator} from "./src/runtime/foundry-sheets.mjs";
import {resolveRuntimeRuleset} from "./src/runtime/runtime-contracts.mjs";
import {installReactions} from "./src/runtime/foundry-reactions.mjs";
import {installCreationButton} from "./src/runtime/foundry-creation.mjs";
import {registerLanguageSetting, chosenLanguage, loadModuleTranslations, applyModuleTranslations} from "./src/core/module-language.mjs";

// The sheet classes, kept to offer the active Ruleset's own sheets once it is loaded.
let rulesetSheets = null;

/** events: () => [{eventTypeId, payload, refs}], emitted in order on the containers they concern. */
function emitModuleEvents(events) {
  Promise.resolve().then(async () => {
    await game.ruleThemAll?.configuratorReady;
    for (const {eventTypeId, payload, refs} of await events()) await game.ruleThemAll.runtime.emitSystemEvent(eventTypeId, payload, refs);
  }).catch(error => console.error("Rule Them'All | Module event failed", error));
}


let storage;
// The module's own interface language, when the user chose one other than Foundry's.
let moduleTranslations = null;

Hooks.once("init", () => {
  game.ruleThemAll ??= {};
  // Foundry's convention for a module's API; game.ruleThemAll is the same object.
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = game.ruleThemAll;
  game.ruleThemAll.registries = engineRegistries();
  registerLanguageSetting(game.settings);
  const language = chosenLanguage(game.settings);
  if (language) {
    game.ruleThemAll.language = language;
    moduleTranslations = loadModuleTranslations(language);
  }
  storage = new WorldSettingStorage(game.settings);
  storage.register();
  FoundryRuntimeAdapter.registerSettings(game.settings);
  ConfiguratorApp.registerSettings(game.settings);
  game.settings.registerMenu(MODULE_ID, "configurator", {
    name: "RTA.Settings.Configurator.Name",
    label: "RTA.Settings.Configurator.Label",
    hint: "RTA.Settings.Configurator.Hint",
    icon: "fa-solid fa-gears",
    type: ConfiguratorApp,
    restricted: true
  });
  // Combatants under a Ruleset with an initiative Test roll it; the others keep the game system's roll.
  installInitiative(CONFIG.Combat.documentClass, () => game.ruleThemAll?.runtime);
  // Rulesets with initiative passes give a second pass (or more) to the fastest combatants before the round ends.
  installInitiativePasses(CONFIG.Combat.documentClass, () => game.ruleThemAll?.runtime);
  // The Ruleset's sheets (or AUTO ones), offered for every Actor and Item type next to the game system's.
  rulesetSheets = registerRulesetSheets();
  Hooks.callAll("ruleThemAllInit", game.ruleThemAll);
  console.log("Rule Them'All | Initialization");
});

// Foundry's translations are loaded: the chosen language replaces the module's texts only.
Hooks.once("i18nInit", () => {
  moduleTranslations?.then(translations => {
    if (!applyModuleTranslations(game.i18n, translations)) return;
    // Read after windows were drawn (a slow file): they are drawn again in the chosen language.
    if (!game.ready) return;
    for (const app of foundry.applications.instances.values()) if (app.rendered) app.render();
    ui.actors?.render?.();
  });
});

// After every module's init, before any Ruleset is loaded or validated.
Hooks.once("setup", () => Hooks.callAll(REGISTER_TYPES_HOOK, game.ruleThemAll.registries));

Hooks.once("ready", () => {
  game.ruleThemAll.configuratorReady = createConfiguratorAPI(storage).then(api => {
    game.ruleThemAll.configurator = api;
    // Writes on Documents a player does not own are relayed to the active GM client (CP-11).
    const relay = new FoundrySocketRelay();
    game.ruleThemAll.runtime = createRuntimeAPI(api, {relay});
    relay.listen(message => game.ruleThemAll.runtime.serveRelay(message));
    // Reactions offered by Triggers are asked of the reacting Actor's player, on their own client.
    installReactions();
    // Players create their character with the active Ruleset's Creation System, from the Actors directory.
    installCreationButton();
    ui.actors?.render?.();
    // GM sandbox only: previews the working draft. Gameplay never uses it.
    game.ruleThemAll.runtimeLab = createRuntimeAPI(api, {rulesetSource: "draft"});
    game.ruleThemAll.content = new FoundryContentBridge(api, game.ruleThemAll.runtime);
    // CP-15: resumable character creation, stored in each user's flags until finalized.
    game.ruleThemAll.creation = new CreationSessions({configurator: api, store: new FoundryCreationSessionStore(), roll: formula => game.ruleThemAll.runtime.roll(formula),
      finalize: (session, {name, actorType}) => game.ruleThemAll.content.createActorFromCreationSystem(session.rulesetVersionId, session.creationSystemId, {name, actorType, answers: session.answers, sessionId: session.id, actorUuid: session.targetActorUuid ?? null})});
    // Ruleset dice (2dp) known to Foundry, so dice in chat messages rebuild; a roll registers its own Ruleset's again.
    const registerDice = () => { for (const family of api.listRulesetFamilies()) for (const version of family.versions) if (version.publishedSnapshot) registerRulesetDice(family.id, version.publishedSnapshot.dice ?? []); };
    registerDice();
    // The active Ruleset's own sheets, by name, in each Document's sheet choice.
    const registerSheets = () => {
      const active = api.getActiveVersionId();
      try {
        const ruleset = active ? resolveRuntimeRuleset(api, active) : null;
        rulesetSheets.registerNamed(ruleset, active ? translator(active) : undefined);
        // Documents on a sheet no longer offered move to the one that fits, written once by the active GM.
        if (game.users.activeGM?.isSelf) repairSheetChoices(rulesetSheets, ruleset, {actors: game.actors ?? [], items: game.items ?? []}).catch(error => console.error("Rule Them'All | Sheet choice repair failed", error));
      } catch (error) { console.error("Rule Them'All | Sheet registration failed", error); }
    };
    registerSheets();
    api.subscribe(() => { registerDice(); registerSheets(); ConfiguratorApp.refreshOpen(); });
    // The world's shared Definitions (a GM reserve, clocks) exist as soon as the active Ruleset names them.
    if (game.users.activeGM?.isSelf) Promise.resolve(game.ruleThemAll.runtime.initializeShared()).catch(error => console.error("Rule Them'All | Shared containers failed", error));
    Hooks.callAll("ruleThemAllReady", game.ruleThemAll);
    console.log("Rule Them'All | Configurator and runtime ready");
    return api;
  });
  game.ruleThemAll.configuratorReady.catch(error => {
    console.error("Rule Them'All | Configurator initialization failed", error);
    // Stored data the module cannot read (a former format to convert): the GM is told, not only the console.
    if (game.user.isGM) ui.notifications?.error?.(`Rule Them'All: ${error?.message ?? error}`, {permanent: true});
  });

  // CP-28: timed states end when the world clock passes them; the active GM writes the change once.
  Hooks.on("updateWorldTime", (worldTime, delta) => {
    if (!game.users.activeGM?.isSelf) return;
    Promise.resolve(game.ruleThemAll?.runtime?.expireAll({worldTime})).catch(error => console.error("Rule Them'All | State expiry failed", error));
    const payload = timeElapsedPayload(worldTime, delta);
    if (payload) emitModuleEvents(async () => [{eventTypeId: "rta.time.elapsed", payload, refs: await game.ruleThemAll.runtime.adapter.listContainers()}]);
  });
  // Module events: Triggers react to the combat tracker; the active GM emits them once.
  Hooks.on("combatTurnChange", (combat, prior, current) => {
    if (!game.users.activeGM?.isSelf) return;
    // A combat that starts gets its shared Definitions before its first events.
    emitModuleEvents(async () => {
      if (Number(prior?.round ?? 0) < 1) await game.ruleThemAll.runtime.initializeShared(undefined, {combat: {kind: "combat", id: combat.id}});
      return combatChangeEvents(combat, prior, current);
    });
    Promise.resolve(game.ruleThemAll?.configuratorReady).then(() => rerollEachRound(combat, prior, current, () => game.ruleThemAll.runtime))
      .catch(error => console.error("Rule Them'All | Initiative reroll failed", error));
  });
  Hooks.on("deleteCombat", combat => {
    if (!game.users.activeGM?.isSelf || !combat.started) return;
    emitModuleEvents(() => [{eventTypeId: "rta.combat.end", payload: {combatId: combat.id, round: combat.round}, refs: combat.combatants.map(c => c.actor?.uuid).filter(Boolean)}]);
  });
  Hooks.on("preCreateItem", (item, _data, _options, userId) => {
    return guardOwnedContentCreation(item,userId,game.user?.id,game.ruleThemAll?.content,{
      requestGuided:({versionId,actorRef,templateId,sourceData})=>queueMicrotask(()=>{
        Promise.resolve(game.ruleThemAll.content.createOwnedContentItem(versionId,actorRef,templateId,{sourceData})).catch(error=>{
          console.error("Rule Them'All | Guided Content creation failed",error);
          ui.notifications?.error?.(error.message);
        });
      }),
      onError:error=>{
        console.error("Rule Them'All | Invalid Content acquisition",error);
        ui.notifications?.error?.(error.message);
      }
    });
  });
  Hooks.on("createItem", (item, _options, userId) => {
    // v14 createItem fires on every connected client, not only the initiator.
    // Only the initiating client may apply runtime state and acquisition flags.
    if (!isOwningContentHook(item,userId,game.user?.id)) return;
    Promise.resolve(game.ruleThemAll?.content?.handleOwnedItemCreated?.(item)).catch(error => {
      console.error("Rule Them'All | Content acquisition failed", error);
      ui.notifications?.error?.(error.message);
    });
  });
  Hooks.on("deleteItem", (item, _options, userId) => {
    if (!isOwningContentHook(item,userId,game.user?.id)) return;
    Promise.resolve(game.ruleThemAll?.content?.releaseOwnedItem?.(item)).catch(error => {
      console.error("Rule Them'All | Content release failed", error);
      ui.notifications?.error?.(error.message);
    });
  });
});
