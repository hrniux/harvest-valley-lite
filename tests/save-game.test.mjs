import assert from "node:assert/strict";
import test from "node:test";
import * as game from "../src/game-state.js";

const { ACTIONS, createGameState, performAction, selectSlot, tickDay, summarizeState } = game;

function progressedFarm() {
  const state = createGameState({ seed: 42 });
  performAction(state, ACTIONS.TILL);
  performAction(state, ACTIONS.PLANT);
  performAction(state, ACTIONS.WATER);
  tickDay(state);
  state.inventory.turnips = 3;
  performAction(state, ACTIONS.DELIVER);
  performAction(state, ACTIONS.SELL);
  performAction(state, ACTIONS.UPGRADE);
  performAction(state, ACTIONS.BUY_SEED);
  selectSlot(state, 8);
  return state;
}

test("saved farms restore crops, economy, quest, time, counters and selection independently", () => {
  assert.equal(typeof game.serializeGameState, "function", "Farm serialization is missing");
  assert.equal(typeof game.restoreGameState, "function", "Farm restoration is missing");
  const state = progressedFarm();
  const encoded = game.serializeGameState(state);
  const restored = game.restoreGameState(encoded);
  assert.equal(JSON.parse(encoded).version, 1);
  assert.deepEqual(summarizeState(restored), summarizeState(state));
  assert.equal(restored.seed, 42);
  assert.equal(restored.actionCount, 3);
  assert.equal(restored.minute, 535);
  assert.equal(restored.gold, 8);
  assert.equal(restored.bagSize, 5);
  assert.equal(restored.seeds, 4);
  assert.deepEqual(restored.board, { need: 2, reward: 60, completed: true });
  assert.equal(restored.plots[4].crop.stage, 1);
  restored.plots[4].crop.stage = 2;
  restored.inventory.turnips = 2;
  assert.equal(state.plots[4].crop.stage, 1);
  assert.equal(state.inventory.turnips, 0);
});

test("reload resumes future weather and board renewals instead of reseeding", () => {
  assert.equal(typeof game.restoreGameState, "function", "Farm restoration is missing");
  const uninterrupted = progressedFarm();
  const resumed = game.restoreGameState(game.serializeGameState(uninterrupted));
  const weather = [];
  for (let day = 0; day < 20; day += 1) {
    tickDay(uninterrupted);
    tickDay(resumed);
    weather.push(resumed.weather);
    assert.deepEqual(summarizeState(resumed), summarizeState(uninterrupted));
    assert.equal(resumed.randomState, uninterrupted.randomState);
  }
  assert.deepEqual(weather.slice(0, 5), ["sunny", "sunny", "sunny", "rain", "sunny"]);
  assert.deepEqual(resumed.board, { need: 3, reward: 75, completed: false });
});

test("malformed, unsupported and incomplete saves fall back without throwing", () => {
  assert.equal(typeof game.restoreGameState, "function", "Farm restoration is missing");
  for (const value of [null, undefined, "", "{", "null", "[]", "false", "{}", '{"version":2,"state":{}}']) {
    assert.equal(game.restoreGameState(value), null, String(value));
  }
  const valid = JSON.parse(game.serializeGameState(progressedFarm()));
  delete valid.state.randomState;
  assert.equal(game.restoreGameState(JSON.stringify(valid)), null);
});

test("invalid persisted numbers and plot shapes never enter gameplay", () => {
  assert.equal(typeof game.restoreGameState, "function", "Farm restoration is missing");
  const cases = [
    (state) => { state.day = 0; },
    (state) => { state.minute = 1440; },
    (state) => { state.gold = -1; },
    (state) => { state.seeds = 0.5; },
    (state) => { state.bagSize = 0; },
    (state) => { state.inventory.turnips = state.bagSize + 1; },
    (state) => { state.stamina = 16; },
    (state) => { state.reputation = -1; },
    (state) => { state.selectedIndex = 9; },
    (state) => { state.actionCount = Number.MAX_SAFE_INTEGER + 1; },
    (state) => { state.seed = "42"; },
    (state) => { state.randomState = 2 ** 32; },
    (state) => { state.randomState = -1; },
    (state) => { state.weather = "snow"; },
    (state) => { state.message = null; },
    (state) => { state.board.completed = "false"; },
    (state) => { state.board.need = 0; },
    (state) => { state.board.reward = -1; },
    (state) => { state.plots.pop(); },
    (state) => { state.plots[0] = null; },
    (state) => { state.plots[0].tilled = "false"; },
    (state) => { state.plots[4].crop.stage = 3; },
    (state) => { state.plots[4].crop.stage = 0.5; },
    (state) => { state.plots[4].tilled = false; },
  ];
  for (const [index, invalidate] of cases.entries()) {
    const payload = JSON.parse(game.serializeGameState(progressedFarm()));
    invalidate(payload.state);
    assert.equal(game.restoreGameState(JSON.stringify(payload)), null, `Invalid fixture ${index}`);
  }
});

for (const [name, invalidate] of [
  ["a bag size that cannot result from upgrades", (state) => { state.bagSize = 4; }],
  ["a board reward that cannot result from quest renewal", (state) => { state.board.reward = 61; }],
  ["a quest reward inconsistent with reputation", (state) => { state.board.reward = 75; }],
  ["a quest requirement inconsistent with reputation", (state) => { state.board.need = 3; }],
  ["a completed quest without its reputation reward", (state) => { state.board.completed = true; }],
  ["a time outside the game's five-minute increments", (state) => { state.minute = 481; }],
  ["a dry growing crop during rain", (state) => {
    state.weather = "rain";
    state.plots[4] = { tilled: true, watered: false, crop: { stage: 0 } };
  }],
]) {
  test(`restoration rejects ${name}`, () => {
    const payload = JSON.parse(game.serializeGameState(createGameState({ seed: 42 })));
    invalidate(payload.state);
    assert.equal(game.restoreGameState(JSON.stringify(payload)), null);
  });
}

test("rainy planting, watered mature crops and empty dry harvested plots remain restorable", () => {
  const farm = createGameState({ seed: 42 });
  for (let i = 0; i < 5; i += 1) tickDay(farm);
  assert.equal(farm.weather, "rain");
  performAction(farm, ACTIONS.TILL);
  performAction(farm, ACTIONS.PLANT);
  assert.deepEqual(farm.plots[4], { tilled: true, watered: true, crop: { stage: 0 } });
  assert.deepEqual(summarizeState(game.restoreGameState(game.serializeGameState(farm))), summarizeState(farm));
  // Grow naturally, then wait for the next actual rain before harvesting.
  tickDay(farm);
  if (!farm.plots[4].watered) performAction(farm, ACTIONS.WATER);
  tickDay(farm);
  assert.equal(farm.plots[4].crop.stage, 2);
  while (farm.weather !== "rain") tickDay(farm);
  assert.equal(farm.plots[4].watered, true);
  assert.deepEqual(summarizeState(game.restoreGameState(game.serializeGameState(farm))), summarizeState(farm));
  performAction(farm, ACTIONS.HARVEST);
  assert.deepEqual(farm.plots[4], { tilled: true, watered: false, crop: null });
  assert.deepEqual(summarizeState(game.restoreGameState(game.serializeGameState(farm))), summarizeState(farm));
});

async function saveModule() {
  // Dynamic import keeps the missing feature an explicit assertion in RED.
  let module;
  try { module = await import("../src/save-game.js"); } catch {}
  assert.equal(typeof module?.createSaveStore, "function", "Resilient save store is missing");
  return module;
}

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, "harvest-valley-lite-save"); return value; },
    setItem(key, next) { assert.equal(key, "harvest-valley-lite-save"); value = next; },
    removeItem(key) { assert.equal(key, "harvest-valley-lite-save"); value = null; },
    read: () => value,
  };
}

test("save storage roundtrips a farm and exposes a truthful saved status", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage();
  const store = createSaveStore(() => storage);
  assert.equal(store.load(), null);
  assert.equal(store.status.kind, "new");
  const state = progressedFarm();
  assert.equal(store.save(state), true);
  assert.equal(store.status.kind, "saved");
  assert.deepEqual(summarizeState(createSaveStore(() => storage).load()), summarizeState(state));
});

test("corrupt saves recover with an explanation and can be replaced by playing", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage("{broken");
  const store = createSaveStore(() => storage);
  assert.equal(store.load(), null);
  assert.equal(store.status.kind, "invalid");
  assert.equal(store.save(createGameState({ seed: 7 })), true);
  assert.equal(createSaveStore(() => storage).load().seed, 7);
});

test("unavailable storage getter or read cannot crash loading or future gameplay", async () => {
  const { createSaveStore } = await saveModule();
  const unavailable = () => { throw new Error("Storage denied"); };
  for (const getStorage of [unavailable, () => ({ getItem: unavailable })]) {
    const store = createSaveStore(getStorage);
    assert.equal(store.load(), null);
    assert.equal(store.status.kind, "protected");
    const farm = createGameState({ seed: 1 });
    performAction(farm, ACTIONS.TILL);
    assert.equal(store.save(farm), false);
    assert.equal(farm.plots[4].tilled, true);
    assert.equal(store.status.kind, "protected");
  }
});

test("failed initial reads protect the prior farm from automatic writes for the session", async () => {
  const { createSaveStore } = await saveModule();
  const prior = createGameState({ seed: 42 });
  for (let i = 0; i < 9; i += 1) tickDay(prior);
  const previous = game.serializeGameState(prior);
  const storage = memoryStorage(previous);
  const healthyRead = storage.getItem;
  storage.getItem = () => { throw new Error("Read denied while writes work"); };
  const store = createSaveStore(() => storage);
  const live = store.load() || createGameState({ seed: 42 });
  performAction(live, ACTIONS.TILL);
  assert.equal(store.save(live), false, "Autosave must not replace unknown prior progress");
  assert.equal(storage.read(), previous, "The day-10 farm must remain byte-for-byte intact");
  assert.equal(store.status.kind, "protected");
  assert.match(store.status.message, /changes are not saved/i);
  storage.getItem = healthyRead;
  performAction(live, ACTIONS.PLANT);
  assert.equal(store.save(live), false, "Recovered reads alone must not replace the active unsaved farm automatically");
  assert.equal(storage.read(), previous);
  assert.equal(createSaveStore(() => storage).load().day, 10, "Reload can restore the retained farm");
});

test("only a successful explicit replacement unlocks autosave after a failed initial read", async () => {
  const { createSaveStore } = await saveModule();
  const prior = progressedFarm();
  const previous = game.serializeGameState(prior);
  const storage = memoryStorage(previous);
  storage.getItem = () => { throw new Error("Read denied"); };
  const store = createSaveStore(() => storage);
  store.load();
  assert.equal(typeof store.replace, "function", "Confirmed replacement must have an explicit save path");
  const fresh = createGameState({ seed: 42 });
  const healthyWrite = storage.setItem;
  storage.setItem = () => { throw new Error("Write denied"); };
  assert.equal(store.replace(fresh), false);
  assert.equal(storage.read(), previous);
  assert.equal(store.status.kind, "protected");
  storage.setItem = healthyWrite;
  performAction(fresh, ACTIONS.TILL);
  assert.equal(store.save(fresh), false, "Failed replacement must leave autosave blocked");
  assert.equal(storage.read(), previous);
  assert.equal(store.replace(fresh), true);
  assert.equal(store.status.kind, "saved");
  performAction(fresh, ACTIONS.PLANT);
  assert.equal(store.save(fresh), true);
  assert.equal(game.restoreGameState(storage.read()).day, 1);
  assert.equal(game.restoreGameState(storage.read()).plots[4].crop.stage, 0);
});

test("write failures retain the previous save and allow retries after storage recovers", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage();
  const store = createSaveStore(() => storage);
  const farm = createGameState({ seed: 42 });
  assert.equal(store.save(farm), true);
  const previous = storage.read();
  const healthyWrite = storage.setItem;
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  performAction(farm, ACTIONS.TILL);
  assert.equal(store.save(farm), false);
  assert.equal(storage.read(), previous);
  assert.equal(store.status.kind, "unavailable");
  storage.setItem = healthyWrite;
  assert.equal(store.save(farm), true);
  assert.equal(store.status.kind, "saved");
  assert.equal(createSaveStore(() => storage).load().plots[4].tilled, true);
});

test("a stale tab cannot overwrite a newer farm saved by another tab", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage(game.serializeGameState(createGameState({ seed: 42 })));
  const first = createSaveStore(() => storage);
  const second = createSaveStore(() => storage);
  const active = first.load();
  const stale = second.load();
  performAction(active, ACTIONS.SLEEP);
  assert.equal(first.save(active), true);
  const newer = storage.read();
  performAction(stale, ACTIONS.TILL);
  assert.equal(second.save(stale), false, "A stale tab must not replace day 2 with day 1");
  assert.equal(storage.read(), newer);
  assert.equal(second.status.kind, "conflict");
  assert.match(second.status.message, /another tab/i);
  assert.match(second.status.message, /changes are not saved/i);
  assert.equal(createSaveStore(() => storage).load().day, 2, "Reload restores the newer farm");
});

test("tabs opened before the first save cannot replace each other's new progress", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage();
  const first = createSaveStore(() => storage);
  const second = createSaveStore(() => storage);
  first.load();
  second.load();
  const active = createGameState({ seed: 42 });
  performAction(active, ACTIONS.SLEEP);
  assert.equal(first.save(active), true);
  const newer = storage.read();
  assert.equal(second.save(createGameState({ seed: 42 })), false);
  assert.equal(storage.read(), newer);
  assert.equal(second.status.kind, "conflict");
});

test("a removed save is not silently recreated by an already open tab", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage(game.serializeGameState(progressedFarm()));
  const store = createSaveStore(() => storage);
  const stale = store.load();
  storage.removeItem("harvest-valley-lite-save");
  performAction(stale, ACTIONS.SLEEP);
  assert.equal(store.save(stale), false);
  assert.equal(storage.read(), null);
  assert.equal(store.status.kind, "conflict");
});

test("external malformed save changes remain untouched until explicit replacement", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage(game.serializeGameState(progressedFarm()));
  const store = createSaveStore(() => storage);
  const farm = store.load();
  const previous = storage.read();
  storage.setItem("harvest-valley-lite-save", "{externally changed");
  assert.equal(store.save(farm), false);
  assert.equal(storage.read(), "{externally changed");
  assert.equal(store.status.kind, "conflict");
  storage.setItem("harvest-valley-lite-save", previous);
  assert.equal(store.save(farm), false, "Returning to old bytes must not silently unlock a conflicted tab");
  assert.equal(storage.read(), previous);
});

test("failed conflict reads protect saved bytes even when writes still work", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage(game.serializeGameState(progressedFarm()));
  const store = createSaveStore(() => storage);
  const farm = store.load();
  const previous = storage.read();
  const healthyRead = storage.getItem;
  storage.getItem = () => { throw new Error("Read denied after loading"); };
  performAction(farm, ACTIONS.SLEEP);
  assert.equal(store.save(farm), false);
  assert.equal(storage.read(), previous);
  assert.equal(store.status.kind, "protected");
  storage.getItem = healthyRead;
  assert.equal(store.save(farm), false, "Read recovery must not silently unlock the unsaved session");
  assert.equal(storage.read(), previous);
});

test("only a successful confirmed replacement resumes saving after a conflict", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage(game.serializeGameState(createGameState({ seed: 42 })));
  const store = createSaveStore(() => storage);
  const stale = store.load();
  storage.setItem("harvest-valley-lite-save", game.serializeGameState(progressedFarm()));
  const newer = storage.read();
  assert.equal(store.save(stale), false);
  const healthyWrite = storage.setItem;
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  const replacement = createGameState({ seed: 7 });
  assert.equal(store.replace(replacement), false);
  assert.equal(store.status.kind, "conflict");
  storage.setItem = healthyWrite;
  assert.equal(store.save(replacement), false, "Failed replacement must keep autosave blocked");
  assert.equal(storage.read(), newer);
  assert.equal(store.replace(replacement), true);
  performAction(replacement, ACTIONS.TILL);
  assert.equal(store.save(replacement), true);
  const restored = createSaveStore(() => storage).load();
  assert.equal(restored.seed, 7);
  assert.equal(restored.plots[4].tilled, true);
});

test("confirmed replacement permits unreadable storage only until comparison reads recover", async () => {
  const { createSaveStore } = await saveModule();
  const storage = memoryStorage(game.serializeGameState(progressedFarm()));
  const healthyRead = storage.getItem;
  const deniedRead = () => { throw new Error("Read denied while writes work"); };
  storage.getItem = deniedRead;
  const store = createSaveStore(() => storage);
  store.load();
  const fresh = createGameState({ seed: 7 });
  assert.equal(store.replace(fresh), true);
  performAction(fresh, ACTIONS.TILL);
  assert.equal(store.save(fresh), true, "Successful explicit replacement permits continued writes");
  storage.getItem = healthyRead;
  performAction(fresh, ACTIONS.PLANT);
  assert.equal(store.save(fresh), true);
  const previous = storage.read();
  storage.getItem = deniedRead;
  performAction(fresh, ACTIONS.WATER);
  assert.equal(store.save(fresh), false, "After a readable comparison, new read failures protect saved progress again");
  assert.equal(storage.read(), previous);
  assert.equal(store.status.kind, "protected");
});
