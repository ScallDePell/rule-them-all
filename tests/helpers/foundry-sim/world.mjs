/* A simulated Foundry v14 world for multi-client tests. The server (this thread) holds the world's data, checks
   each write against the requesting user's ownership as Foundry's server does, and broadcasts every change to all
   connected clients. Each client is a worker thread with its own globals (game, Hooks, CONFIG...) that loads the real
   rule-them-all.mjs and runs init, setup and ready, so the GM's and the players' module instances only talk through
   documents, settings and the module socket, as in Foundry.

   const world = startWorld({users, actors});
   const gm = await world.connect("gm"), alice = await world.connect("alice");
   await alice.run(async ({v}) => game.ruleThemAll.runtime.executeAction(v, "strike", ...), {v});
   await world.settle();
   await world.close(); */
import {Worker} from "node:worker_threads";
import {fileURLToPath} from "node:url";
import {applyChanges, clone, deprecatedDeletions, diffChanges, expand, OWNERSHIP, ROLES, userLevel} from "./documents.mjs";

const CLIENT = fileURLToPath(new URL("./client.mjs", import.meta.url));
const COLLECTIONS = {Actor: "actors", Combat: "combats", ChatMessage: "messages", User: "users"};
const EMBEDDED = {Combatant: "combatants", Item: "items", ActiveEffect: "effects"};
let ids = 0;
const randomId = () => `sim${String(++ids).padStart(13, "0")}`;

/** users: [{_id, name, role}] (role: ROLES); actors: [{_id, name, type, ownership: {default?, [userId]: level}}].
 * options.turnHooks: "updateFirst" (updateCombat, then combatTurnChange) or "turnChangeFirst"; options.seed: dice. */
export function startWorld({users = [], actors = [], settings = {}, options = {}} = {}) {
  const data = {
    users: Object.fromEntries(users.map(user => [user._id, {name: user._id, role: ROLES.PLAYER, character: null, flags: {}, ...clone(user), active: false}])),
    actors: Object.fromEntries(actors.map(actor => [actor._id, {type: "character", ownership: {default: OWNERSHIP.NONE}, flags: {}, system: {}, items: [], effects: [], statuses: [], ...clone(actor)}])),
    combats: {}, messages: {}, settings: clone(settings), worldTime: 0
  };
  const clients = new Map();
  let lastTraffic = Date.now(), inFlight = 0;
  const traffic = () => { lastTraffic = Date.now(); };
  const broadcast = (message, {except = null} = {}) => { traffic(); for (const [id, client] of clients) if (id !== except) client.worker.postMessage(message); };
  const userOf = id => data.users[id] ?? null;
  const usersMessage = () => ({kind: "users", users: clone(data.users)});

  function documentData(documentName, id, parentId) {
    if (parentId) {
      const parent = documentName === "Combatant" ? data.combats[parentId] : data.actors[parentId];
      return parent?.[EMBEDDED[documentName]]?.find(entry => entry._id === id) ?? null;
    }
    return data[COLLECTIONS[documentName]]?.[id] ?? null;
  }
  /** Foundry's server-side permission check: a GM writes anything, a player writes what they own. */
  function canModify(user, documentName, target, parentId) {
    if (!user) return false;
    if (user.role >= ROLES.ASSISTANT) return true;
    if (documentName === "Combat") return false;
    if (documentName === "Combatant") return userLevel(data.actors[target?.actorId], user) >= OWNERSHIP.OWNER;
    if (documentName === "ChatMessage") return target?.author === user._id;
    // A player writes their own User document (its flags, not its role).
    if (documentName === "User") return target?._id === user._id;
    const owner = parentId ? data.actors[parentId] : target;
    return userLevel(owner, user) >= OWNERSHIP.OWNER;
  }
  const denied = (user, action, documentName, id) => new Error(`User ${user?.name ?? "?"} lacks permission to ${action} ${documentName} [${id}]`);

  const handlers = {
    update(user, {documentName, id, parentId = null, changes, options = {}}) {
      const target = documentData(documentName, id, parentId);
      if (!target) throw new Error(`${documentName} [${id}] does not exist`);
      if (!canModify(user, documentName, target, parentId)) throw denied(user, "update", documentName, id);
      // Foundry v14 logs a deprecation warning for the "-=key" syntax: the world keeps them for the tests to check.
      for (const key of deprecatedDeletions(changes)) world.deprecations.push(`${documentName} ${key}`);
      if (documentName === "User" && user.role < ROLES.ASSISTANT && "role" in expand(changes)) throw denied(user, "update", documentName, id);
      const expanded = diffChanges(target, expand(changes));
      if (!Object.keys(expanded).length) return null;
      applyChanges(target, expanded);
      broadcast({kind: "update", documentName, id, parentId, changes: expanded, options, userId: user._id});
      return null;
    },
    create(user, {documentName, parentId = null, data: created, options = {}}) {
      const list = (Array.isArray(created) ? created : [created]).map(entry => ({_id: randomId(), flags: {}, ...clone(entry)}));
      for (const entry of list) {
        if (documentName === "Combatant") entry.initiative ??= null, entry.defeated ??= false;
        if (documentName === "ChatMessage") entry.author ??= user._id;
        if (documentName === "Actor") Object.assign(entry, {type: "character", ownership: {default: OWNERSHIP.NONE, [user._id]: OWNERSHIP.OWNER}, system: {}, items: [], effects: [], statuses: [], ...entry});
        if (documentName === "Combat") Object.assign(entry, {round: 0, turn: null, active: true, combatants: [], ...entry});
        const permitted = documentName === "ChatMessage" || user.role >= ROLES.ASSISTANT || (documentName === "Actor" && user.role >= ROLES.TRUSTED)
          || (parentId && documentName !== "Combatant" && canModify(user, "Actor", data.actors[parentId], null));
        if (!permitted) throw denied(user, "create", documentName, entry._id);
      }
      for (const entry of list) {
        if (parentId) (documentName === "Combatant" ? data.combats[parentId] : data.actors[parentId])[EMBEDDED[documentName]].push(entry);
        else data[COLLECTIONS[documentName]][entry._id] = entry;
      }
      broadcast({kind: "create", documentName, parentId, data: clone(list), options, userId: user._id});
      return list.map(entry => entry._id);
    },
    delete(user, {documentName, id, parentId = null, options = {}}) {
      const target = documentData(documentName, id, parentId);
      if (!target) throw new Error(`${documentName} [${id}] does not exist`);
      if (!canModify(user, documentName, target, parentId)) throw denied(user, "delete", documentName, id);
      if (parentId) { const parent = documentName === "Combatant" ? data.combats[parentId] : data.actors[parentId], list = parent[EMBEDDED[documentName]]; list.splice(list.indexOf(target), 1); }
      else delete data[COLLECTIONS[documentName]][id];
      broadcast({kind: "delete", documentName, id, parentId, options, userId: user._id});
      return null;
    },
    /** World settings: only a GM may write them (Foundry's SETTINGS_MODIFY is off for players by default). */
    setting(user, {key, value}) {
      if (user.role < ROLES.ASSISTANT) throw new Error(`User ${user.name} lacks permission to update Setting [${key}]`);
      data.settings[key] = clone(value);
      broadcast({kind: "setting", key, value: clone(value), userId: user._id});
      return clone(value);
    },
    worldTime(user, {delta}) {
      if (user.role < ROLES.ASSISTANT) throw new Error(`User ${user.name} cannot advance the world time`);
      data.worldTime += Number(delta);
      broadcast({kind: "worldTime", worldTime: data.worldTime, delta: Number(delta)});
      return data.worldTime;
    }
  };

  async function serve(userId, message) {
    const client = clients.get(userId);
    if (message.kind === "socket") return broadcast({kind: "socket", channel: message.channel, message: message.message}, {except: userId});
    if (message.kind === "log") return client.logs.push(message.entry);
    if (message.kind === "result") { const pending = client.pending.get(message.callId); client.pending.delete(message.callId); return message.ok ? pending?.resolve(message.result) : pending?.reject(Object.assign(new Error(message.error.message), {code: message.error.code, stack: message.error.stack})); }
    if (message.kind !== "request") return;
    traffic();
    let response;
    try { response = {ok: true, result: handlers[message.op](userOf(userId), message.payload)}; }
    catch (error) { response = {ok: false, error: {message: error.message}}; }
    client.worker.postMessage({kind: "response", requestId: message.requestId, ...response});
  }

  let calls = 0;
  const world = {
    data,
    deprecations: [],
    /** Start a client for a user; resolves once its module ran init, setup and ready and its configurator loaded. */
    async connect(userId) {
      if (!data.users[userId]) throw new Error(`Unknown user ${userId}`);
      if (clients.has(userId)) throw new Error(`${userId} is already connected`);
      data.users[userId].active = true;
      const worker = new Worker(CLIENT, {workerData: {userId, snapshot: clone(data), options}});
      const client = {worker, pending: new Map(), logs: [], ready: null};
      clients.set(userId, client);
      worker.on("message", message => { inFlight++; Promise.resolve(serve(userId, message)).finally(() => inFlight--); });
      // A client that crashes fails whatever waits on it, the connection included.
      worker.on("error", error => { client.crash = error; for (const pending of client.pending.values()) pending.reject(error); client.pending.clear(); });
      broadcast(usersMessage(), {except: userId});
      const handle = {
        userId,
        logs: client.logs,
        /** Run a function on this client, with its globals; args and the result are structured-cloned. */
        run(fn, args = {}) {
          const callId = ++calls;
          if (client.crash) return Promise.reject(client.crash);
          return new Promise((resolve, reject) => { client.pending.set(callId, {resolve, reject}); traffic(); worker.postMessage({kind: "run", callId, source: String(fn), args}); });
        },
        errors: () => client.logs.filter(entry => entry.level === "error"),
        async disconnect() {
          clients.delete(userId);
          data.users[userId].active = false;
          await worker.terminate();
          broadcast(usersMessage());
        }
      };
      await handle.run(async () => { await game.ruleThemAll.configuratorReady; });
      return handle;
    },
    /** Wait until no message has crossed the world for `quiet` ms (module event queues, debounced checks). */
    async settle({quiet = 250, timeout = 10000} = {}) {
      const start = Date.now();
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 25));
        if (!inFlight && Date.now() - lastTraffic >= quiet) return;
        if (Date.now() - start > timeout) throw new Error("The simulated world did not settle.");
      }
    },
    async close() { for (const id of [...clients.keys()]) { const client = clients.get(id); clients.delete(id); await client.worker.terminate(); } }
  };
  return world;
}
