import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIONS,
  createGameState,
  performAction,
  selectSlot,
  tickDay,
} from "../src/game-state.js";

test("a watered crop grows, harvests, sells, and funds an upgrade", () => {
  const state = createGameState({ seed: 1 });

  selectSlot(state, 4);
  assert.equal(performAction(state, ACTIONS.TILL).ok, true);
  assert.equal(performAction(state, ACTIONS.PLANT).ok, true);
  assert.equal(performAction(state, ACTIONS.WATER).ok, true);

  tickDay(state);
  assert.equal(state.plots[4].crop.stage, 1);
  assert.equal(state.day, 2);

  selectSlot(state, 4);
  assert.equal(performAction(state, ACTIONS.WATER).ok, true);
  tickDay(state);
  assert.equal(state.plots[4].crop.stage, 2);

  selectSlot(state, 4);
  assert.equal(performAction(state, ACTIONS.HARVEST).ok, true);
  assert.equal(state.inventory.turnips, 1);

  assert.equal(performAction(state, ACTIONS.SELL).ok, true);
  assert.equal(state.gold, 35);

  state.gold = 75;
  assert.equal(performAction(state, ACTIONS.UPGRADE).ok, true);
  assert.equal(state.bagSize, 5);
  assert.equal(state.gold, 0);
});

test("the player cannot work forever after stamina is empty", () => {
  const state = createGameState();
  state.stamina = 1;
  selectSlot(state, 0);

  assert.equal(performAction(state, ACTIONS.TILL).ok, true);
  assert.equal(state.stamina, 0);

  selectSlot(state, 1);
  const result = performAction(state, ACTIONS.TILL);
  assert.equal(result.ok, false);
  assert.match(result.message, /tired/i);
});

test("invalid farm actions do not spend stamina", () => {
  const state = createGameState();
  selectSlot(state, 0);

  const result = performAction(state, ACTIONS.PLANT);
  assert.equal(result.ok, false);
  assert.equal(state.stamina, 12);
  assert.equal(state.minute, 8 * 60);
});

test("daily board goals reward focused farming", () => {
  const state = createGameState();
  state.inventory.turnips = 3;

  const result = performAction(state, ACTIONS.DELIVER);
  assert.equal(result.ok, true);
  assert.equal(state.inventory.turnips, 1);
  assert.equal(state.gold, 60);
  assert.equal(state.reputation, 1);
  assert.equal(state.board.completed, true);
});
