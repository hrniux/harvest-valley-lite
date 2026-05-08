export const ACTIONS = Object.freeze({
  TILL: "till",
  PLANT: "plant",
  WATER: "water",
  HARVEST: "harvest",
  SELL: "sell",
  DELIVER: "deliver",
  BUY_SEED: "buy_seed",
  UPGRADE: "upgrade",
  SLEEP: "sleep",
  CONTEXT: "context",
});

const GRID_SIZE = 9;
const MAX_STAGE = 2;
const STARTING_STAMINA = 12;
const TURNIP_PRICE = 35;
const SEED_PRICE = 12;
const UPGRADE_PRICE = 75;
const ACTION_MINUTES = 20;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function makePlots() {
  return Array.from({ length: GRID_SIZE }, () => ({
    tilled: false,
    watered: false,
    crop: null,
  }));
}

export function createGameState(options = {}) {
  const seed = Number.isInteger(options.seed) ? options.seed : Date.now();
  const random = mulberry32(seed);
  return {
    seed,
    random,
    day: 1,
    minute: 8 * 60,
    weather: "sunny",
    stamina: STARTING_STAMINA,
    gold: 0,
    seeds: 4,
    bagSize: 3,
    inventory: { turnips: 0 },
    reputation: 0,
    selectedIndex: 4,
    plots: makePlots(),
    board: {
      need: 2,
      reward: 60,
      completed: false,
    },
    message: "Morning light over the valley. Start by tilling soil.",
    actionCount: 0,
  };
}

export function selectSlot(state, index) {
  const next = Math.max(0, Math.min(state.plots.length - 1, index));
  state.selectedIndex = next;
  return state.selectedIndex;
}

export function moveSelection(state, dx, dy) {
  const x = state.selectedIndex % 3;
  const y = Math.floor(state.selectedIndex / 3);
  const nextX = Math.max(0, Math.min(2, x + dx));
  const nextY = Math.max(0, Math.min(2, y + dy));
  return selectSlot(state, nextY * 3 + nextX);
}

function fail(state, message) {
  state.message = message;
  return { ok: false, message };
}

function succeed(state, message) {
  state.message = message;
  return { ok: true, message };
}

function useStamina(state) {
  if (state.stamina <= 0) {
    return false;
  }
  state.stamina -= 1;
  state.minute += ACTION_MINUTES;
  state.actionCount += 1;
  return true;
}

function selectedPlot(state) {
  return state.plots[state.selectedIndex];
}

function plantName(crop) {
  if (!crop) return "empty";
  if (crop.stage === 0) return "seed";
  if (crop.stage === 1) return "sprout";
  return "ripe turnip";
}

export function describePlot(plot) {
  if (!plot.tilled) return "wild grass";
  if (!plot.crop) return plot.watered ? "wet tilled soil" : "tilled soil";
  const wet = plot.watered ? "wet " : "";
  return `${wet}${plantName(plot.crop)}`;
}

export function canCarryTurnip(state) {
  return state.inventory.turnips < state.bagSize;
}

export function getContextAction(state) {
  const plot = selectedPlot(state);
  if (!plot.tilled) return ACTIONS.TILL;
  if (!plot.crop) return ACTIONS.PLANT;
  if (plot.crop.stage >= MAX_STAGE) return ACTIONS.HARVEST;
  if (!plot.watered && state.weather !== "rain") return ACTIONS.WATER;
  return ACTIONS.SLEEP;
}

export function performAction(state, action) {
  if (action === ACTIONS.CONTEXT) {
    return performAction(state, getContextAction(state));
  }

  if (action === ACTIONS.SELL) {
    if (state.inventory.turnips <= 0) return fail(state, "No turnips to sell yet.");
    state.inventory.turnips -= 1;
    state.gold += TURNIP_PRICE;
    state.minute += 10;
    return succeed(state, `Sold a turnip for ${TURNIP_PRICE}g.`);
  }

  if (action === ACTIONS.DELIVER) {
    if (state.board.completed) return fail(state, "The board request is already complete.");
    if (state.inventory.turnips < state.board.need) {
      return fail(state, `The board still needs ${state.board.need} turnips.`);
    }
    state.inventory.turnips -= state.board.need;
    state.gold += state.board.reward;
    state.reputation += 1;
    state.board.completed = true;
    state.minute += 15;
    return succeed(state, "Delivered the town request. The valley knows your name.");
  }

  if (action === ACTIONS.BUY_SEED) {
    if (state.gold < SEED_PRICE) return fail(state, `Seeds cost ${SEED_PRICE}g.`);
    state.gold -= SEED_PRICE;
    state.seeds += 1;
    state.minute += 10;
    return succeed(state, "Bought one turnip seed.");
  }

  if (action === ACTIONS.UPGRADE) {
    if (state.gold < UPGRADE_PRICE) return fail(state, `Bag upgrade costs ${UPGRADE_PRICE}g.`);
    state.gold -= UPGRADE_PRICE;
    state.bagSize += 2;
    state.minute += 20;
    return succeed(state, "Your bag feels roomy now.");
  }

  if (action === ACTIONS.SLEEP) {
    tickDay(state);
    return succeed(state, `Day ${state.day}. ${state.weather === "rain" ? "Rain waters the crops." : "Clear skies."}`);
  }

  const plot = selectedPlot(state);
  if (action === ACTIONS.TILL) {
    if (plot.tilled) return fail(state, "This plot is already tilled.");
    if (!useStamina(state)) return fail(state, "Too tired. Sleep or sell crops before more farm work.");
    plot.tilled = true;
    return succeed(state, "The soil is ready.");
  }

  if (action === ACTIONS.PLANT) {
    if (!plot.tilled) return fail(state, "Till the soil before planting.");
    if (plot.crop) return fail(state, "A crop is already growing here.");
    if (state.seeds <= 0) return fail(state, "No seeds left. Buy more in town.");
    if (!useStamina(state)) return fail(state, "Too tired. Sleep or sell crops before more farm work.");
    state.seeds -= 1;
    plot.crop = { stage: 0 };
    plot.watered = state.weather === "rain";
    return succeed(state, "Turnip seed tucked into the soil.");
  }

  if (action === ACTIONS.WATER) {
    if (!plot.tilled || !plot.crop) return fail(state, "There is no crop here to water.");
    if (plot.watered || state.weather === "rain") return fail(state, "This crop has enough water today.");
    if (!useStamina(state)) return fail(state, "Too tired. Sleep or sell crops before more farm work.");
    plot.watered = true;
    return succeed(state, "Water sparkles on the leaves.");
  }

  if (action === ACTIONS.HARVEST) {
    if (!plot.crop || plot.crop.stage < MAX_STAGE) return fail(state, "This crop is not ready yet.");
    if (!canCarryTurnip(state)) return fail(state, "Your bag is full. Sell or upgrade first.");
    if (!useStamina(state)) return fail(state, "Too tired. Sleep or sell crops before more farm work.");
    plot.crop = null;
    plot.watered = false;
    state.inventory.turnips += 1;
    return succeed(state, "Harvested a crisp valley turnip.");
  }

  return fail(state, "Unknown action.");
}

export function tickDay(state) {
  for (const plot of state.plots) {
    if (plot.crop && (plot.watered || state.weather === "rain")) {
      plot.crop.stage = Math.min(MAX_STAGE, plot.crop.stage + 1);
    }
    plot.watered = false;
  }

  state.day += 1;
  state.minute = 8 * 60;
  state.stamina = STARTING_STAMINA + Math.min(3, state.reputation);
  state.weather = state.random() < 0.22 ? "rain" : "sunny";
  if (state.weather === "rain") {
    for (const plot of state.plots) {
      if (plot.crop) plot.watered = true;
    }
  }
  if (state.board.completed && state.day % 3 === 1) {
    state.board = {
      need: 2 + Math.min(3, state.reputation),
      reward: 60 + state.reputation * 15,
      completed: false,
    };
  }
  state.message = state.weather === "rain" ? "Rain taps on the roof." : "The valley wakes under warm sun.";
}

export function summarizeState(state) {
  return {
    note: "Farm grid origin is top-left; x increases right, y increases down.",
    day: state.day,
    time: formatTime(state.minute),
    weather: state.weather,
    stamina: state.stamina,
    gold: state.gold,
    seeds: state.seeds,
    turnips: state.inventory.turnips,
    bagSize: state.bagSize,
    reputation: state.reputation,
    selected: {
      index: state.selectedIndex,
      x: state.selectedIndex % 3,
      y: Math.floor(state.selectedIndex / 3),
      plot: describePlot(selectedPlot(state)),
      contextAction: getContextAction(state),
    },
    board: { ...state.board },
    plots: state.plots.map((plot, index) => ({
      index,
      x: index % 3,
      y: Math.floor(index / 3),
      tilled: plot.tilled,
      watered: plot.watered,
      cropStage: plot.crop ? plot.crop.stage : null,
      label: describePlot(plot),
    })),
    message: state.message,
  };
}

export function formatTime(minute) {
  const wrapped = Math.max(0, minute) % (24 * 60);
  const hour24 = Math.floor(wrapped / 60);
  const hour = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const minutes = String(wrapped % 60).padStart(2, "0");
  return `${hour}:${minutes} ${suffix}`;
}

export const ECONOMY = Object.freeze({
  TURNIP_PRICE,
  SEED_PRICE,
  UPGRADE_PRICE,
  STARTING_STAMINA,
});
