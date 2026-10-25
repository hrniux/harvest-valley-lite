import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const screenshotDir = path.join(rootDir, "output", "browser");
const chromePath = process.env.CHROME_EXECUTABLE
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const cleanPath = decodeURIComponent(url.pathname);
    const relativePath = cleanPath === "/" ? "index.html" : cleanPath.slice(1);
    const candidate = path.normalize(path.join(distDir, relativePath));
    if (!candidate.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const filePath = await fileExists(candidate) ? candidate : path.join(distDir, "index.html");
    const ext = path.extname(filePath);
    try {
      const body = await fs.readFile(filePath);
      res.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function verifyKeyboardControls(browser, url) {
  const checks = [];
  const cases = [
    ["Space activates the focused Sell button once", async (page) => {
      await page.evaluate(() => { window.__harvestValleyState.inventory.turnips = 2; });
      await page.locator('button[data-action="sell"]').focus();
      await page.keyboard.press("Space");
      const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      assert.equal(state.gold, 35);
      assert.equal(state.turnips, 1);
      assert.equal(state.plots[4].tilled, false);
    }],
    ["Enter activates the focused Sell button once", async (page) => {
      await page.evaluate(() => { window.__harvestValleyState.inventory.turnips = 2; });
      await page.locator('button[data-action="sell"]').focus();
      await page.keyboard.press("Enter");
      const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      assert.equal(state.gold, 35);
      assert.equal(state.turnips, 1);
      assert.equal(state.plots[4].tilled, false);
    }],
    ["Space activates the focused Sleep button", async (page) => {
      await page.locator('button[data-action="sleep"]').focus();
      await page.keyboard.press("Space");
      const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      assert.equal(state.day, 2);
      assert.equal(state.plots[4].tilled, false);
    }],
    ["Space retains the canvas context action", async (page) => {
      await page.locator("canvas").focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Space");
      await page.keyboard.press("Space");
      const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      assert.equal(state.plots[4].tilled, true);
      assert.equal(state.plots[4].cropStage, 0);
      assert.equal(state.plots[4].watered, true);
      assert.equal(state.stamina, 9);
    }],
    ...["window blur", "hidden document", "canvas blur"].map((transition) => [
      `Movement stops after ${transition}`,
      async (page) => {
        await page.locator("canvas").focus();
        await page.keyboard.down("ArrowRight");
        const selected = await page.evaluate((transition) => {
          if (transition === "window blur") {
            window.dispatchEvent(new Event("blur"));
          } else if (transition === "hidden document") {
            Object.defineProperty(document, "hidden", { configurable: true, value: true });
            document.dispatchEvent(new Event("visibilitychange"));
          } else {
            document.querySelector('button[data-action="sell"]').focus();
          }
          window.__harvestValleyState.selectedIndex = 4;
          window.advanceTime(500);
          return window.__harvestValleyState.selectedIndex;
        }, transition);
        await page.keyboard.up("ArrowRight");
        assert.equal(selected, 4, "Lost focus must not leave a movement key held");

        // A fresh key press must still work after returning to the canvas.
        await page.evaluate(() => { delete document.hidden; });
        await page.locator("canvas").focus();
        await page.keyboard.down("ArrowLeft");
        const moved = await page.evaluate(() => {
          window.advanceTime(200);
          return window.__harvestValleyState.selectedIndex;
        });
        await page.keyboard.up("ArrowLeft");
        assert.equal(moved, 3);
      },
    ]),
  ];

  for (const [name, run] of cases) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await run(page);
      checks.push({ name, ok: true });
    } catch (error) {
      checks.push({ name, ok: false, error: String(error) });
    } finally {
      await page.close();
    }
  }
  console.log(JSON.stringify({ keyboardChecks: checks }, null, 2));
  assert.ok(checks.every((check) => check.ok), "Keyboard regression checks must pass");
  return checks;
}

async function main() {
  assert.equal(await fileExists(chromePath), true, `Chrome executable not found: ${chromePath}`);
  assert.equal(await fileExists(distDir), true, "Run npm run build before browser verification.");
  await fs.mkdir(screenshotDir, { recursive: true });

  const { server, url } = await startServer();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("canvas").focus();
    await page.keyboard.press("1");
    await page.keyboard.press("2");
    await page.keyboard.press("3");
    await page.keyboard.press("KeyN");
    await page.keyboard.press("3");
    await page.keyboard.press("KeyN");
    await page.keyboard.press("4");
    await page.keyboard.press("5");
    await page.screenshot({ path: path.join(screenshotDir, "gameplay.png"), fullPage: true });

    const summary = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(summary.day, 3);
    assert.equal(summary.gold, 35);
    assert.equal(summary.turnips, 0);
    assert.match(summary.selected.plot, /tilled soil|wild grass|seed|sprout|turnip/);
    assert.equal(errors.length, 0, errors.join("\n"));

    const pixels = await page.locator("canvas").evaluate((canvas) => {
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let filled = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) filled += 1;
      }
      return { filled, total: data.length / 4 };
    });
    assert.ok(pixels.filled > pixels.total * 0.95, "Canvas should be visibly rendered.");

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 740 }, isMobile: true });
    await mobilePage.goto(url, { waitUntil: "networkidle" });
    await mobilePage.screenshot({ path: path.join(screenshotDir, "mobile.png"), fullPage: true });
    const mobileLayout = await mobilePage.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      canvasWidth: document.querySelector("canvas").getBoundingClientRect().width,
    }));
    assert.ok(mobileLayout.scrollWidth <= mobileLayout.innerWidth + 1, "Mobile layout should not overflow horizontally.");
    assert.ok(mobileLayout.canvasWidth <= mobileLayout.innerWidth, "Canvas should fit mobile viewport.");
    await mobilePage.close();

    const keyboardChecks = await verifyKeyboardControls(browser, url);
    console.log(JSON.stringify({
      ok: true,
      url,
      summary,
      keyboardChecks,
      screenshots: ["output/browser/gameplay.png", "output/browser/mobile.png"],
    }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
