'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;


const SKINS = {
  retro: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
    bg: '#1a1a25',
    grid: '#22222e',
    highlight: 0.12,
    glow: false,
    pixelArt: false,
  },
  neon: {
    colors: [null, '#00ffff', '#ffff00', '#ff00ff', '#00ff88', '#ff3366', '#0088ff', '#ff8800'],
    bg: '#000000',
    grid: '#111111',
    highlight: 0.15,
    glow: true,
    pixelArt: false,
  },
  pastel: {
    colors: [null, '#b5ead7', '#ffeaa7', '#dda0dd', '#c3b1e1', '#ffb7c5', '#aec6cf', '#ffcba4'],
    bg: '#f0eaf8',
    grid: '#d4c8e8',
    highlight: 0.4,
    glow: false,
    pixelArt: false,
  },
  pixel: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
    bg: '#1a1a25',
    grid: '#22222e',
    highlight: 0.12,
    glow: false,
    pixelArt: true,
  },
};

let activeSkin = 'retro';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const HS_KEY = 'tetris.highscores';
const MAX_HS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const overlayLeaderboard = document.getElementById('overlay-leaderboard');
const nameInput = document.getElementById('name-input');
const saveBtn = document.getElementById('save-btn');
const sideLeaderboard = document.getElementById('side-leaderboard');
const clearHsBtn = document.getElementById('clear-hs-btn');

let board, current, next, score, lines, level, paused, gameOver,
    lastTime, dropAccum, dropInterval, animId, maxCombo, currentComboEntry;

// ---- localStorage helpers ----

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

function saveHighscores(hs) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(hs));
  } catch (_) { /* quota exceeded — ignore */ }
}

/** Returns the rank (1-based) if score enters top MAX_HS, else null. */
function getRank(newScore) {
  const hs = loadHighscores();
  if (hs.length < MAX_HS) return hs.length + 1;
  if (newScore > (hs[MAX_HS - 1]?.score ?? 0)) return MAX_HS;
  return null;
}

function addHighscore(name, entryScore, entryLines, entryCombo) {
  const hs = loadHighscores();
  hs.push({ name: name.trim() || 'Anónimo', score: entryScore, lines: entryLines, bestCombo: entryCombo });
  hs.sort((a, b) => b.score - a.score);
  hs.splice(MAX_HS);
  saveHighscores(hs);
  return hs;
}

// ---- Leaderboard rendering ----

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTable(hs, highlightScore) {
  if (hs.length === 0) {
    return '<p class="hs-empty">Sin récords aún</p>';
  }
  let html = '<table class="hs-table"><thead><tr>'
    + '<th>#</th><th>Nombre</th><th>Ptos</th><th>L</th><th>C</th>'
    + '</tr></thead><tbody>';
  hs.forEach((entry, i) => {
    const highlighted = highlightScore !== null && entry.score === highlightScore;
    const cls = highlighted ? ' class="hs-highlight"' : '';
    html += `<tr${cls}>`
      + `<td>${i + 1}</td>`
      + `<td>${escapeHtml(entry.name)}</td>`
      + `<td>${entry.score.toLocaleString()}</td>`
      + `<td>${entry.lines}</td>`
      + `<td>${entry.bestCombo}</td>`
      + '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function renderSideLeaderboard() {
  sideLeaderboard.innerHTML = buildTable(loadHighscores(), null);
}

function renderOverlayLeaderboard(highlightScore) {
  overlayLeaderboard.innerHTML = buildTable(loadHighscores(), highlightScore);
}

// ---- Board / piece logic ----

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared > maxCombo) maxCombo = cleared;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function applySkin(name) {
  if (!SKINS[name]) return;
  activeSkin = name;
  const bg = SKINS[name].bg;
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  try { localStorage.setItem('tetris.skin', name); } catch (_) {}
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin];
  const color = skin.colors[colorIndex];
  const bx = x * size + 1;
  const by = y * size + 1;
  const bw = size - 2;
  const bh = size - 2;

  context.globalAlpha = alpha ?? 1;

  if (skin.glow) {
    context.shadowBlur = 15;
    context.shadowColor = color;
  }

  context.fillStyle = color;
  context.fillRect(bx, by, bw, bh);

  if (skin.glow) {
    context.shadowBlur = 0;
  }

  // highlight stripe
  context.fillStyle = `rgba(255,255,255,${skin.highlight})`;
  context.fillRect(bx, by, bw, 4);

  if (skin.pixelArt) {
    // dark inner border (2px)
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.fillRect(bx, by + bh - 2, bw, 2);      // bottom edge
    context.fillRect(bx + bw - 2, by, 2, bh);       // right edge
    // 4 shadow pixels at bottom-right corner
    context.fillStyle = 'rgba(0,0,0,0.6)';
    context.fillRect(bx + bw - 4, by + bh - 4, 4, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[activeSkin].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const rank = getRank(score);
  if (rank !== null) {
    // Score enters top 5 — show name input
    nameInput.value = '';
    nameInput.style.display = 'block';
    saveBtn.style.display = 'inline-block';
    overlayLeaderboard.innerHTML = '';
    currentComboEntry = { score, lines, maxCombo };
  } else {
    // Does not enter top 5 — show table directly
    nameInput.style.display = 'none';
    saveBtn.style.display = 'none';
    currentComboEntry = null;
    renderOverlayLeaderboard(null);
  }

  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameInput.style.display = 'none';
    saveBtn.style.display = 'none';
    overlayLeaderboard.innerHTML = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  maxCombo = 0;
  currentComboEntry = null;
  next = randomPiece();
  spawn();
  if (gameOver) return; // spawn triggered endGame (piece collided immediately)
  updateHUD();
  nameInput.style.display = 'none';
  saveBtn.style.display = 'none';
  overlayLeaderboard.innerHTML = '';
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// Restore saved skin on startup
(function restoreSkin() {
  const saved = localStorage.getItem('tetris.skin');
  const skinSelect = document.getElementById('skin-select');
  const name = (saved && SKINS[saved]) ? saved : 'retro';
  applySkin(name);
  if (skinSelect) skinSelect.value = name;
})();

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

saveBtn.addEventListener('click', () => {
  if (!currentComboEntry) return;
  addHighscore(nameInput.value, currentComboEntry.score, currentComboEntry.lines, currentComboEntry.maxCombo);
  nameInput.style.display = 'none';
  saveBtn.style.display = 'none';
  renderOverlayLeaderboard(currentComboEntry.score);
  renderSideLeaderboard();
  currentComboEntry = null;
});

nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveBtn.click();
});

clearHsBtn.addEventListener('click', () => {
  try { localStorage.removeItem(HS_KEY); } catch (_) {}
  renderSideLeaderboard();
  if (!overlay.classList.contains('hidden') && gameOver) {
    overlayLeaderboard.innerHTML = '<p class="hs-empty">Sin récords aún</p>';
  }
});

const skinSelect = document.getElementById('skin-select');
if (skinSelect) {
  skinSelect.addEventListener('change', e => {
    applySkin(e.target.value);
  });
}

// Initial render of side leaderboard
renderSideLeaderboard();

init();
