import "./styles.css";
import {
  ACTIONS,
  ECONOMY,
  createGameState,
  describePlot,
  formatTime,
  moveSelection,
  performAction,
  selectSlot,
  summarizeState,
} from "./game-state.js";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 640;
const TILE = 76;
const FARM_X = 96;
const FARM_Y = 176;
const FARM_GAP = 14;

const app = document.querySelector("#app");
const shell = document.createElement("main");
shell.className = "game-shell";
shell.innerHTML = `
  <section class="stage" aria-label="Harvest Valley Lite game">
    <canvas id="game" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" tabindex="0" aria-label="Harvest Valley Lite canvas"></canvas>
  </section>
  <nav class="toolbar" aria-label="Farm actions">
    <button data-action="${ACTIONS.TILL}">1 Till</button>
    <button data-action="${ACTIONS.PLANT}">2 Plant</button>
    <button data-action="${ACTIONS.WATER}">3 Water</button>
    <button data-action="${ACTIONS.HARVEST}">4 Harvest</button>
    <button data-action="${ACTIONS.SELL}">5 Sell</button>
    <button data-action="${ACTIONS.DELIVER}">6 Deliver</button>
    <button data-action="${ACTIONS.BUY_SEED}">7 Seed</button>
    <button data-action="${ACTIONS.UPGRADE}">8 Bag</button>
    <button data-action="${ACTIONS.SLEEP}">N Sleep</button>
  </nav>
`;
app.append(shell);

const canvas = shell.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const state = createGameState({ seed: 42 });
const keys = new Set();
let moveCooldown = 0;
let pulse = 0;

const farmRects = Array.from({ length: 9 }, (_, index) => {
  const x = FARM_X + (index % 3) * (TILE + FARM_GAP);
  const y = FARM_Y + Math.floor(index / 3) * (TILE + FARM_GAP);
  return { x, y, w: TILE, h: TILE };
});

function runAction(action) {
  performAction(state, action);
  if (state.minute >= 23 * 60) {
    performAction(state, ACTIONS.SLEEP);
  }
  render();
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }
  if (event.repeat && !["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
    return;
  }
  keys.add(key);

  if (key === "1") runAction(ACTIONS.TILL);
  if (key === "2") runAction(ACTIONS.PLANT);
  if (key === "3") runAction(ACTIONS.WATER);
  if (key === "4") runAction(ACTIONS.HARVEST);
  if (key === "5") runAction(ACTIONS.SELL);
  if (key === "6") runAction(ACTIONS.DELIVER);
  if (key === "7") runAction(ACTIONS.BUY_SEED);
  if (key === "8") runAction(ACTIONS.UPGRADE);
  if (key === "n") runAction(ACTIONS.SLEEP);
  if (key === " ") runAction(ACTIONS.CONTEXT);
  if (key === "f") toggleFullscreen();
}

function handleKeyUp(event) {
  keys.delete(event.key.toLowerCase());
}

function handlePointer(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const index = farmRects.findIndex((plot) => (
    x >= plot.x && x <= plot.x + plot.w && y >= plot.y && y <= plot.y + plot.h
  ));
  if (index >= 0) {
    selectSlot(state, index);
    render();
    canvas.focus();
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    shell.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function update(dt) {
  pulse += dt;
  moveCooldown = Math.max(0, moveCooldown - dt);
  if (moveCooldown <= 0) {
    let dx = 0;
    let dy = 0;
    if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
    if (keys.has("arrowright") || keys.has("d")) dx += 1;
    if (keys.has("arrowup") || keys.has("w")) dy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dy += 1;
    if (dx || dy) {
      moveSelection(state, Math.sign(dx), Math.sign(dy));
      moveCooldown = 0.14;
    }
  }
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawText(text, x, y, size = 18, color = "#2b211b", align = "left") {
  ctx.fillStyle = color;
  ctx.font = `${size}px "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, Math.round(x), Math.round(y));
}

function drawPixelHouse(x, y) {
  drawRect(x + 22, y, 92, 30, "#b65038");
  drawRect(x + 12, y + 30, 112, 78, "#f0b36b");
  drawRect(x + 48, y + 62, 32, 46, "#6f3b2c");
  drawRect(x + 24, y + 48, 22, 22, "#76a9d5");
  drawRect(x + 88, y + 48, 22, 22, "#76a9d5");
  drawRect(x + 6, y + 26, 124, 10, "#8e352c");
  drawRect(x + 58, y + 86, 6, 6, "#e6c15b");
}

function drawFence() {
  ctx.fillStyle = "#8d6a3f";
  for (let x = 68; x <= 384; x += 28) {
    ctx.fillRect(x, 150, 8, 272);
  }
  ctx.fillRect(68, 162, 316, 8);
  ctx.fillRect(68, 396, 316, 8);
}

function drawPlot(plot, rect, index) {
  const selected = state.selectedIndex === index;
  drawRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, selected ? "#f7dc6f" : "#836742");
  drawRect(rect.x, rect.y, rect.w, rect.h, plot.tilled ? "#8f5a31" : "#5f8f45");
  if (!plot.tilled) {
    for (let i = 0; i < 7; i += 1) {
      drawRect(rect.x + 8 + i * 9, rect.y + 48 - (i % 3) * 8, 4, 16, "#7fb45a");
    }
  } else {
    for (let i = 0; i < 4; i += 1) {
      drawRect(rect.x + 10, rect.y + 14 + i * 14, 56, 4, "#704326");
    }
  }
  if (plot.watered) {
    drawRect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12, "rgba(98, 163, 185, 0.38)");
  }
  if (plot.crop) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (plot.crop.stage === 0) {
      drawRect(cx - 5, cy + 8, 10, 8, "#dfd174");
    } else if (plot.crop.stage === 1) {
      drawRect(cx - 4, cy + 4, 8, 24, "#3d8d44");
      drawRect(cx - 16, cy + 6, 14, 8, "#54ad58");
      drawRect(cx + 2, cy + 14, 16, 8, "#54ad58");
    } else {
      drawRect(cx - 16, cy + 6, 32, 26, "#eee5c5");
      drawRect(cx - 20, cy + 12, 40, 14, "#d9cfae");
      drawRect(cx - 8, cy - 10, 16, 18, "#4fa653");
      drawRect(cx + 4, cy - 4, 18, 8, "#61b765");
    }
  }
}

function drawFarmer() {
  const rect = farmRects[state.selectedIndex];
  const bob = Math.sin(pulse * 8) * 2;
  const x = rect.x + 48;
  const y = rect.y - 28 + bob;
  drawRect(x - 10, y, 20, 10, "#d84a39");
  drawRect(x - 12, y + 10, 24, 18, "#f2c28a");
  drawRect(x - 9, y + 28, 18, 24, "#4e7dbd");
  drawRect(x - 18, y + 34, 10, 8, "#f2c28a");
  drawRect(x + 8, y + 34, 10, 8, "#f2c28a");
  drawRect(x - 14, y + 52, 10, 8, "#5b3b2e");
  drawRect(x + 4, y + 52, 10, 8, "#5b3b2e");
}

function drawHud() {
  drawRect(0, 0, CANVAS_WIDTH, 92, "#f2d391");
  drawRect(0, 84, CANVAS_WIDTH, 8, "#a87945");
  drawText("Harvest Valley Lite", 34, 18, 26, "#3d2b20");
  drawText(`Day ${state.day}  ${formatTime(state.minute)}  ${state.weather}`, 34, 54, 18, "#59402b");
  drawText(`Gold ${state.gold}g`, 448, 18, 22, "#3d2b20");
  drawText(`Seeds ${state.seeds}  Turnips ${state.inventory.turnips}/${state.bagSize}`, 448, 52, 18, "#59402b");
  drawText(`Energy ${state.stamina}/${ECONOMY.STARTING_STAMINA + Math.min(3, state.reputation)}`, 696, 18, 18, "#3d2b20");
  drawText(`Rep ${state.reputation}`, 696, 52, 18, "#59402b");
}

function drawTown() {
  drawRect(486, 142, 360, 360, "#77a55e");
  drawRect(520, 180, 102, 86, "#d69453");
  drawRect(512, 170, 118, 14, "#8f4332");
  drawText("Shop", 542, 206, 18, "#3b281d");
  drawRect(680, 166, 88, 94, "#e0b168");
  drawRect(698, 204, 52, 38, "#f6e2a4");
  drawText("Board", 695, 174, 16, "#3b281d");
  drawText(`${state.board.completed ? "Done" : `${state.board.need} turnips`}`, 694, 212, 14, "#3b281d");
  drawText(`${state.board.reward}g`, 704, 232, 14, "#3b281d");
  drawRect(560, 338, 188, 26, "#9f8152");
  drawRect(644, 260, 28, 108, "#9f8152");
  drawRect(790, 350, 42, 64, "#776f7b");
  drawRect(796, 338, 30, 18, "#5a5260");
  drawText("Mine", 786, 424, 15, "#47382c");
  drawRect(574, 294, 20, 30, "#5f7fc0");
  drawRect(570, 284, 28, 14, "#f0be83");
  drawText("Jun", 566, 328, 14, "#47382c");
}

function wrapText(text, x, y, maxWidth, lineHeight, size, color) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  ctx.font = `${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}

function drawBottomPanel() {
  drawRect(28, 528, 904, 84, "#f5e1aa");
  drawRect(28, 528, 904, 6, "#a87945");
  const plot = state.plots[state.selectedIndex];
  drawText(`Plot ${state.selectedIndex + 1}: ${describePlot(plot)}`, 52, 548, 18, "#3c2b20");
  wrapText(state.message, 52, 576, 570, 18, 16, "#5c432f");
  drawText("Move: WASD/Arrows  Space: context  N: sleep  F: fullscreen", 648, 548, 15, "#4d3829");
  drawText("1 till  2 plant  3 water  4 harvest", 648, 572, 15, "#4d3829");
}

function render() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, state.weather === "rain" ? "#8fb0b8" : "#9fd29c");
  drawRect(0, 92, CANVAS_WIDTH, CANVAS_HEIGHT - 92, state.weather === "rain" ? "#6c9c72" : "#7fbd69");
  drawHud();
  drawPixelHouse(82, 104);
  drawFence();
  state.plots.forEach((plot, index) => drawPlot(plot, farmRects[index], index));
  drawFarmer();
  drawTown();
  drawBottomPanel();
}

function gameLoop(previousTime = performance.now()) {
  requestAnimationFrame((now) => {
    const dt = Math.min(0.05, (now - previousTime) / 1000);
    update(dt);
    render();
    gameLoop(now);
  });
}

canvas.addEventListener("keydown", handleKeyDown);
canvas.addEventListener("keyup", handleKeyUp);
canvas.addEventListener("pointerdown", handlePointer);
shell.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    runAction(button.dataset.action);
    canvas.focus();
  });
});

window.addEventListener("keydown", (event) => {
  if (document.activeElement !== canvas) handleKeyDown(event);
});
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("resize", render);

window.render_game_to_text = () => JSON.stringify(summarizeState(state));
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    update(1 / 60);
  }
  render();
};
window.__harvestValleyState = state;

render();
gameLoop();
queueMicrotask(() => canvas.focus());
