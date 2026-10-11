import {MODULE_ID, REGISTER_TYPES_HOOK} from "./src/core/module-contract.mjs";
import {engineRegistries} from "./src/configurator/operation-registries.mjs";
import {createConfiguratorAPI} from "./src/configurator/configurator-api.mjs";
import {ConfiguratorApp} from "./src/configurator/configurator-app.mjs";
import {WorldSettingStorage} from "./src/configurator/world-setting-storage.mjs";
import {createRuntimeAPI} from "./src/runtime/runtime-api.mjs";
import {FoundrySocketRelay} from "./src/runtime/runtime-relay.mjs";
import {FoundryContentBridge} from "./src/runtime/foundry-content-bridge.mjs";
import {isOwningContentHook,guardOwnedContentCreation} from "./src/runtime/foundry-content-hooks.mjs";


let storage;

Hooks.once("init", () => {
  game.ruleThemAll ??= {};
  game.ruleThemAll.registries = engineRegistries();
  storage = new WorldSettingStorage(game.settings);
  storage.register();
  ConfiguratorApp.registerSettings(game.settings);
  game.settings.registerMenu(MODULE_ID, "configurator", {
    name: "RTA.Settings.Configurator.Name",
    label: "RTA.Settings.Configurator.Label",
    hint: "RTA.Settings.Configurator.Hint",
    icon: "fa-solid fa-gears",
    type: ConfiguratorApp,
    restricted: true
  });
  Hooks.callAll("ruleThemAllInit", game.ruleThemAll);
  console.log("Rule Them'All | Initialization");
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
    // GM sandbox only: previews the working draft. Gameplay never uses it.
    game.ruleThemAll.runtimeLab = createRuntimeAPI(api, {rulesetSource: "draft"});
    game.ruleThemAll.content = new FoundryContentBridge(api, game.ruleThemAll.runtime);
    api.subscribe(() => ConfiguratorApp.refreshOpen());
    Hooks.callAll("ruleThemAllReady", game.ruleThemAll);
    console.log("Rule Them'All | Configurator and runtime ready");
    return api;
  });
  game.ruleThemAll.configuratorReady.catch(error => console.error("Rule Them'All | Configurator initialization failed", error));

  // CP-28: timed states end when the world clock passes them; the active GM writes the change once.
  Hooks.on("updateWorldTime", worldTime => {
    if (!game.users.activeGM?.isSelf) return;
    Promise.resolve(game.ruleThemAll?.runtime?.expireAll({worldTime})).catch(error => console.error("Rule Them'All | State expiry failed", error));
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
