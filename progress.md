Original prompt: 在这个目录新建一个项目，是一个web前端项目，做一个好玩的游戏，类似于星露谷那样的简化版本，推送到我的github主干上

## Progress

- Created the project skeleton and started with core gameplay tests for the farming loop.
- Verified the first test run fails because `src/game-state.js` does not exist yet.
- Implemented the testable farm state engine, Canvas game shell, browser verification script, styles, and project metadata.
- Ran the full check once; logic tests, Vite build, and desktop browser gameplay verification passed.
- Inspected `output/browser/gameplay.png`; the farm, town, HUD, selected plot, and toolbar are visible.
- Extended browser verification to include a mobile viewport overflow check and screenshot.
- Re-ran `npm run check`; 4 logic tests, Vite production build, desktop gameplay browser flow, and mobile overflow check passed.
- Inspected `output/browser/mobile.png`; the canvas and action buttons fit inside the mobile viewport.

## Next Agent Notes

- The project intentionally uses vanilla Canvas plus a small testable state engine.
- Browser verification launches the local macOS Chrome executable via Playwright and does not require Playwright-managed browser downloads.
