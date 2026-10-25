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

## Saved progress

Your farm saves automatically after actions and plot selection changes, and restores when you return in the same browser. Crops, inventory, upgrades, the town request, and future weather all continue from your last save. The status below the farm shows whether progress is saved.

Saves stay on this browser and device; clearing site data removes them. If browser storage is blocked or full, you can keep playing, but the status warns that changes are not saved. An unreadable or unsupported save starts a fresh playable farm and is replaced by your next action.

If the browser cannot access existing saved progress, autosave pauses for that session to protect it. Reload to retry restoring the saved farm, or confirm **New farm** to replace it. Autosave resumes only after that replacement is successfully saved; a failed replacement keeps the prior save protected.

Use **New farm** to restart. A confirmation lets you cancel before the current save is replaced.

## Verification

```bash
npm run check
```

This runs game-logic tests, creates a production build, and verifies the browser game with Playwright.
