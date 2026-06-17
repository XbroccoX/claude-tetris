# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vanilla JavaScript Tetris — no build step, no dependencies, no framework. Three files: `index.html`, `style.css`, `game.js`.

## Running the Game

Open `index.html` directly in a browser, or serve it locally:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Architecture

All game logic lives in `game.js` (~305 lines), organized into these sections:

- **Constants** — board dimensions (`COLS=10`, `ROWS=20`, `BLOCK=30`), piece shapes, colors, scoring table
- **Board/Piece logic** — `createBoard`, `randomPiece`, `collide`, `rotateCW`, `tryRotate` (wall kicks), `merge`
- **Game mechanics** — `clearLines`, `ghostY`, `hardDrop`, `softDrop`, `lockPiece`, `spawn`
- **Rendering** — `drawBlock`, `drawGrid`, `draw` (main canvas), `drawNext` (preview canvas)
- **Game loop** — `loop()` via `requestAnimationFrame`, time-accumulated drops
- **Controls** — single `keydown` listener; `init`, `togglePause`, `endGame`, `updateHUD`

**State** is module-level variables: `board`, `current`, `next`, `score`, `lines`, `level`, `dropInterval`, `animId`, `paused`.

**Speed progression**: `dropInterval = Math.max(100, 1000 - (level - 1) * 90)` ms, level increments every 10 lines.

**Scoring**: points × level multiplier; hard drop adds 2 pts/cell, soft drop adds 1 pt/row.

## Controls

| Key | Action |
|-----|--------|
| ← → | Move left/right |
| ↑ / X | Rotate clockwise |
| ↓ | Soft drop |
| Space | Hard drop |
| P | Pause/Resume |
