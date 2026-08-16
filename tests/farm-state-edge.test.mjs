import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIONS,
  canCarryTurnip,
  createGameState,
  formatTime,
  moveSelection,
  performAction,
  selectSlot,
  tickDay,
} from "../src/game-state.js";

test("SELL fails when the inventory has no turnips", () => {
  const state = createGameState({ seed: 1 });
  const result = performAction(state, ACTIONS.SELL);
  assert.equal(result.ok, false);
  assert.equal(state.gold, 0);
});

test("DELIVER fails when the board still needs more turnips", () => {
  const state = createGameState({ seed: 1 });
  state.inventory.turnips = 1; // board needs 2
  const result = performAction(state, ACTIONS.DELIVER);
  assert.equal(result.ok, false);
  assert.match(result.message, /needs 2/);
});

test("DELIVER fails when the board request is already complete", () => {
  const state = createGameState({ seed: 1 });
  state.board.completed = true;
  state.inventory.turnips = 5;
  const result = performAction(state, ACTIONS.DELIVER);
  assert.equal(result.ok, false);
  assert.match(result.message, /already complete/);
});

test("BUY_SEED fails without enough gold", () => {
  const state = createGameState({ seed: 1 });
  state.gold = 5; // seed costs 12
  const result = performAction(state, ACTIONS.BUY_SEED);
  assert.equal(result.ok, false);
  assert.equal(state.seeds, 4);
});

test("UPGRADE fails without enough gold", () => {
  const state = createGameState({ seed: 1 });
  state.gold = 50; // upgrade costs 75
  const result = performAction(state, ACTIONS.UPGRADE);
  assert.equal(result.ok, false);
  assert.equal(state.bagSize, 3);
});

test("PLANT fails with no seeds", () => {
  const state = createGameState({ seed: 1 });
  state.seeds = 0;
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  const result = performAction(state, ACTIONS.PLANT);
  assert.equal(result.ok, false);
  assert.match(result.message, /No seeds/);
});

test("TILL fails on an already tilled plot", () => {
  const state = createGameState({ seed: 1 });
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  const result = performAction(state, ACTIONS.TILL);
  assert.equal(result.ok, false);
});

test("WATER fails when there is no crop", () => {
  const state = createGameState({ seed: 1 });
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL); // tilled but no crop
  const result = performAction(state, ACTIONS.WATER);
  assert.equal(result.ok, false);
  assert.match(result.message, /no crop/);
});

test("WATER fails when the crop is already watered", () => {
  const state = createGameState({ seed: 1 });
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  performAction(state, ACTIONS.PLANT);
  performAction(state, ACTIONS.WATER);
  const result = performAction(state, ACTIONS.WATER);
  assert.equal(result.ok, false);
  assert.match(result.message, /enough water/);
});

test("WATER fails during rain (crops are auto-watered)", () => {
  const state = createGameState({ seed: 1 });
  state.weather = "rain";
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  performAction(state, ACTIONS.PLANT);
  const result = performAction(state, ACTIONS.WATER);
  assert.equal(result.ok, false);
});

test("HARVEST fails when the crop is not ripe", () => {
  const state = createGameState({ seed: 1 });
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  performAction(state, ACTIONS.PLANT);
  const result = performAction(state, ACTIONS.HARVEST); // stage 0
  assert.equal(result.ok, false);
  assert.match(result.message, /not ready/);
});

test("HARVEST fails when the bag is full", () => {
  const state = createGameState({ seed: 1 });
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  performAction(state, ACTIONS.PLANT);
  state.plots[0].crop.stage = 2; // force ripe
  state.inventory.turnips = state.bagSize; // bag full
  const result = performAction(state, ACTIONS.HARVEST);
  assert.equal(result.ok, false);
  assert.match(result.message, /full/);
});

test("tickDay resets time and stamina, grows watered crops", () => {
  const state = createGameState({ seed: 1 });
  state.stamina = 3;
  state.minute = 18 * 60;
  selectSlot(state, 0);
  performAction(state, ACTIONS.TILL);
  performAction(state, ACTIONS.PLANT);
  performAction(state, ACTIONS.WATER);
  tickDay(state);
  assert.equal(state.day, 2);
  assert.equal(state.minute, 8 * 60);
  assert.equal(state.stamina, 12); // reputation 0 → no bonus
  assert.equal(state.plots[0].crop.stage, 1);
});

test("tickDay grants a stamina bonus from reputation", () => {
  const state = createGameState({ seed: 1 });
  state.reputation = 5;
  tickDay(state);
  assert.equal(state.stamina, 15); // 12 + min(3, 5)
});

test("formatTime handles midnight, noon, and out-of-range input", () => {
  assert.equal(formatTime(0), "12:00 AM");
  assert.equal(formatTime(720), "12:00 PM");
  assert.equal(formatTime(1439), "11:59 PM");
  assert.equal(formatTime(-1), "12:00 AM");
  assert.equal(formatTime(24 * 60), "12:00 AM");
});

test("selectSlot clamps out-of-range indices", () => {
  const state = createGameState({ seed: 1 });
  assert.equal(selectSlot(state, -1), 0);
  assert.equal(selectSlot(state, 99), 8);
});

test("moveSelection clamps at the grid edge", () => {
  const state = createGameState({ seed: 1 });
  selectSlot(state, 0); // top-left
  assert.equal(moveSelection(state, -1, 0), 0);
  assert.equal(moveSelection(state, 0, -1), 0);
});

test("canCarryTurnip respects the bag size", () => {
  const state = createGameState({ seed: 1 });
  state.inventory.turnips = 2;
  assert.equal(canCarryTurnip(state), true);
  state.inventory.turnips = state.bagSize;
  assert.equal(canCarryTurnip(state), false);
});
