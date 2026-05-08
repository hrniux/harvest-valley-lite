# Harvest Valley Lite

A compact browser farming game inspired by the relaxed loop of Stardew Valley: clear a small plot, plant turnips, water them, sleep through days, harvest crops, sell produce, and upgrade your tiny farm.

## Play

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Controls

- Arrow keys or `WASD`: move the farmer between plots.
- `1`: till soil.
- `2`: plant a seed.
- `3`: water.
- `4`: harvest.
- `5`: sell one turnip.
- `6`: deliver the board request.
- `7`: buy a seed.
- `8`: upgrade the bag.
- `Space`: context action.
- `N`: sleep until tomorrow.
- `F`: fullscreen.

## Verification

```bash
npm run check
```

This runs game-logic tests, creates a production build, and verifies the browser game with Playwright.
