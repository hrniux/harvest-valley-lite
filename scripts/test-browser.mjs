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

    console.log(JSON.stringify({
      ok: true,
      url,
      summary,
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
