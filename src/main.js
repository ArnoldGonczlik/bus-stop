import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createScene, updateScene, treeColliders } from './scene.js';
import { createBus } from './bus.js';
import { createPassengers, resetPassengers, updatePassengers, forcePassengerChat, setLanguage, setNightMode } from './passengers.js';
import { initInventory, setInventoryLang, setInventoryVisible, getItemCount, resetInventory, deductInventory } from './inventory.js';
import { spawnWorldItems, updateWorldItems, resetWorldItems, setHardMode, spawnTripCoins } from './worldItems.js';
import { createBusDriver, triggerRejection, updateBusDriver, resetBusDriver, shouldDriveBus } from './busDriver.js';

// ---- UI translations ----
const UI = {
  no: {
    start:         'Klikk for å starte',
    win:           'Du tok bussen!',
    winRestart:    'Trykk R for å starte på nytt',
    death:         'Du ble overkjørt...',
    bestTimes:     'Beste tider',
    timeLabel:     'Tid',
    modeTitle:     'Velg vanskelighetsgrad',
    modeEasy:      'Lett',
    modeEasyDesc:  'Utforsk fritt',
    modeHard:      'Vanskelig',
    modeHardDesc:  'Samle 10 mynter for å gå på',
    keybinds: [
      ['W A S D',       'Gå'],
      ['Shift',         'Løp'],
      ['Enter',         'Bytt kamera (1./3. person)'],
      ['Klikk',         'Snakk med passasjer'],
      ['R',             'Start på nytt'],
    ],
  },
  en: {
    start:         'Click to start',
    win:           'You caught the bus!',
    winRestart:    'Press R to restart',
    death:         'You died...',
    bestTimes:     'Best Times',
    timeLabel:     'Time',
    modeTitle:     'Choose difficulty',
    modeEasy:      'Easy',
    modeEasyDesc:  'Explore freely',
    modeHard:      'Hard',
    modeHardDesc:  'Collect 10 coins to board',
    keybinds: [
      ['W A S D',       'Move'],
      ['Shift',         'Sprint'],
      ['Enter',         'Toggle camera (1st/3rd person)'],
      ['Click',         'Talk to passenger'],
      ['R',             'Restart'],
    ],
  },
};
let uiLang = 'no';

function applyLang(lang) {
  uiLang = lang;
  setLanguage(lang);
  setInventoryLang(lang);
  const t = UI[lang];
  document.getElementById('start-message').textContent  = t.start;
  document.getElementById('win-restart').textContent    = t.winRestart;
  document.getElementById('death-message').textContent  = t.death;
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  // Update mode screen text (even if already hidden, harmless)
  document.getElementById('mode-title').textContent      = t.modeTitle;
  document.getElementById('mode-easy-label').textContent = t.modeEasy;
  document.getElementById('mode-easy-desc').textContent  = t.modeEasyDesc;
  document.getElementById('mode-hard-label').textContent = t.modeHard;
  document.getElementById('mode-hard-desc').textContent  = t.modeHardDesc;
  // Keybinds
  const kb = document.getElementById('keybinds');
  kb.innerHTML = t.keybinds.map(([key, desc]) =>
    `<div class="kb-row"><span class="kb-key">${key}</span><span class="kb-desc">${desc}</span></div>`
  ).join('');
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLang(btn.dataset.lang));
});

// Populate all translated text (including keybinds) on initial load
applyLang(uiLang);

// ---- Mode screen (shown once at page load) ----
const modeScreen = document.getElementById('mode-screen');

function selectMode(hard) {
  hardMode = hard;
  setHardMode(hard);
  spawnWorldItems(scene);           // coins only spawn in hard mode
  modeScreen.classList.add('hidden');
  overlay.classList.remove('hidden');
}

document.getElementById('mode-easy').addEventListener('click', () => selectMode(false));
document.getElementById('mode-hard').addEventListener('click', () => selectMode(true));

// ---- Constants ----
const PLAYER_HEIGHT  = 1.7;
const PLAYER_START_X = 0;
const PLAYER_START_Z = -15;
const MOVE_SPEED     = 3.2;

const BUS_ARRIVAL_DELAY  = 6000;
const BUS_START_X        = -120;
const BUS_STOP_X         = 0;
const BUS_TRAVEL_SPEED      = 4.5;
const BUS_KICK_DEPART_SPEED = 24;   // angry driver floors it
const BUS_LEAVE_TARGET_X    = 120;
const BUS_WAIT_DURATION  = 15;
// Total seconds from game-start until bus arrives (delay + travel time)
const BUS_ARRIVAL_TOTAL_SECS = BUS_ARRIVAL_DELAY / 1000 + (BUS_STOP_X - BUS_START_X) / BUS_TRAVEL_SPEED;

const DOOR_TRIGGER_X    = 3.5;
const DOOR_TRIGGER_Z    = -7.5;
const DOOR_TRIGGER_SIZE = 0.6;

// Bus bounding box (local space)
const BUS_LOCAL_MIN_X  = -5.0;
const BUS_LOCAL_MAX_X  = 6.6;
const BUS_Z_CENTER     = -6;
const BUS_HALF_WIDTH_Z = 1.5;

// ---- State ----
let gameStarted = false;
let gameWon     = false;
let gameDead    = false;
let gameKicked  = false;   // rejection cutscene active
let hardMode    = false;

// Knockback animation state (set when kick lands)
let kickAnim   = null;    // { startZ, targetZ, timer, duration }
let shakeTimer = 0;
const SHAKE_DURATION = 0.55;

// Trip-over state
let tripAnim    = null;  // { timer, duration } — active during trip cutscene
let tripCooldown = 0;   // seconds until next trip is allowed
let sprintAccum  = 0;   // accumulated sprint-time for trip roll
const FOREST_Z_FAR  = -10.5;
function isInForest(z) { return z < FOREST_Z_FAR || z > 4; }

let busArrived  = false;
let busAnimating = false;
let busCurrentX  = BUS_START_X;
let busWaitTimer = 0;
let busLeaving   = false;
let pendingReset = false;
let pendingResetAt = 0;
let busArrivalCountdown = BUS_ARRIVAL_TOTAL_SECS; // seconds until bus arrives

let timerStart  = 0;
let elapsedTime = 0;

// Player position — decoupled from camera so third-person works
let playerX = PLAYER_START_X;
let playerZ = PLAYER_START_Z;
let thirdPerson = false;
let bobTimer    = 0;

const moveState = { forward: false, backward: false, left: false, right: false, sprint: false };

// ---- Three.js setup ----
const scene = new THREE.Scene(); // fog + background set by createScene

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(PLAYER_START_X, PLAYER_HEIGHT, PLAYER_START_Z);
camera.rotation.y = Math.PI;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

const overlay     = document.getElementById('overlay');
const winScreen   = document.getElementById('win-screen');
const deathScreen = document.getElementById('death-screen');

// ---- Proximity interaction cursor ----
const _cursorStyle = document.createElement('style');
_cursorStyle.textContent = `
  #idle-cursor {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 7px; height: 7px;
    background: rgba(255,255,255,0.85);
    border-radius: 50%;
    pointer-events: none; z-index: 999; display: none;
    box-shadow: 0 0 4px rgba(0,0,0,0.7);
  }
  #interact-cursor {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -60%);
    font-size: 28px; pointer-events: none;
    z-index: 1000; display: none;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.6));
    animation: cursorPop 0.75s ease-in-out infinite;
  }
  @keyframes cursorPop {
    0%,100% { transform: translate(-50%,-60%) scale(1); }
    50%      { transform: translate(-50%,-60%) scale(1.22); }
  }
`;
document.head.appendChild(_cursorStyle);

const idleCursor     = document.createElement('div');
idleCursor.id = 'idle-cursor';
document.body.appendChild(idleCursor);

const interactCursor = document.createElement('div');
interactCursor.id = 'interact-cursor';
interactCursor.textContent = '👋';
document.body.appendChild(interactCursor);

const INTERACT_DIST_SQ = 2.8 * 2.8;
let nearestInteractable = null;

const { ground, roadBounds, isNight, borderWalls, borderMaxOpacity } = createScene(scene);
setNightMode(isNight);

const bus = createBus();
bus.position.set(BUS_START_X, 0, -6);
scene.add(bus);

// ---- Bus countdown timer sprite ----
const timerCanvas = document.createElement('canvas');
timerCanvas.width  = 256;
timerCanvas.height = 82;
const timerCtx     = timerCanvas.getContext('2d');
const timerTexture = new THREE.CanvasTexture(timerCanvas);
const timerMat     = new THREE.MeshBasicMaterial({ map: timerTexture, side: THREE.FrontSide });
const timerSprite  = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), timerMat);
timerSprite.rotation.y = Math.PI;
timerSprite.visible    = false;
scene.add(timerSprite);

function syncTimerPosition() {
  timerSprite.position.set(busCurrentX + 3.5, 2.5, BUS_Z_CENTER - 1.585);
}

function updateTimerSprite(seconds) {
  const W = 256, H = 82;
  timerCtx.clearRect(0, 0, W, H);
  timerCtx.fillStyle = '#000000';
  timerCtx.fillRect(0, 0, W, H);
  timerCtx.strokeStyle = seconds <= 5 ? '#ff3333' : '#333333';
  timerCtx.lineWidth = 3;
  timerCtx.strokeRect(2, 2, W - 4, H - 4);
  timerCtx.fillStyle = seconds <= 5 ? '#ff3333' : '#ffffff';
  timerCtx.font = 'bold 28px "Courier New", monospace';
  timerCtx.textAlign = 'center';
  timerCtx.textBaseline = 'middle';
  timerCtx.fillText(String(Math.ceil(seconds)).padStart(2, '0') + 's', W / 2, H / 2);
  timerTexture.needsUpdate = true;
}

// ---- Bus arrival information board (standalone structure) ----
  const poleMat  = new THREE.MeshLambertMaterial({ color: 0x555566 });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x1a237e });
  const sideMat  = new THREE.MeshLambertMaterial({ color: 0x0d1545 });

  // Two support poles
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.055, 2.8, 8);
  [-0.72, 0.72].forEach(ox => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(3.5 + ox, 1.4, -12.5);
    pole.castShadow = true;
    scene.add(pole);
  });

  // Board body (deep box — gives it physical presence)
  const boardBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.14), frameMat);
  boardBody.position.set(3.5, 2.45, -12.5);
  boardBody.castShadow = true;
  scene.add(boardBody);

  // Thin coloured top stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.145), new THREE.MeshLambertMaterial({ color: 0xf9a825 }));
  stripe.position.set(3.5, 3.07, -12.5);
  scene.add(stripe);

  // Side edges (give depth framing effect)
  const edgeGeo = new THREE.BoxGeometry(0.055, 1.1, 0.145);
  [-0.92, 0.92].forEach(ox => {
    const e = new THREE.Mesh(edgeGeo, sideMat);
    e.position.set(3.5 + ox, 2.45, -12.5);
    scene.add(e);
  });

  // Night light underneath board
  if (isNight) {
    const pt = new THREE.PointLight(0xaabbff, 1.4, 4, 2);
    pt.position.set(3.5, 2.1, -12.2);
    scene.add(pt);
  }

// Canvas display face — sits flush on the front of the board
const arrivalCanvas  = document.createElement('canvas');
arrivalCanvas.width  = 512;
arrivalCanvas.height = 320;
const arrivalCtx     = arrivalCanvas.getContext('2d');
const arrivalTexture = new THREE.CanvasTexture(arrivalCanvas);
arrivalTexture.minFilter = THREE.LinearFilter;
arrivalTexture.generateMipmaps = false;
const arrivalMat    = new THREE.MeshBasicMaterial({ map: arrivalTexture, transparent: false, side: THREE.FrontSide });
const arrivalSprite = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 1.05), arrivalMat);
arrivalSprite.position.set(3.5, 2.45, -12.35);
scene.add(arrivalSprite);

function updateArrivalSign(countdown) {
  const W = 512, H = 320;
  const ctx = arrivalCtx;
  ctx.clearRect(0, 0, W, H);

  // ── Background gradient ──────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   '#0d1b5e');
  bg.addColorStop(1,   '#060d30');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Header bar ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#f9a825';
  ctx.fillRect(0, 0, W, 58);
  ctx.fillStyle = '#1a237e';
  ctx.font = 'bold 32px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚌  RUTE 42', 18, 29);
  ctx.textAlign = 'right';
  ctx.fillText(uiLang === 'en' ? 'NOWHERESVILLE' : 'GOKK', W - 18, 29);

  // ── Divider ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#3d5afe';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(16, 70); ctx.lineTo(W - 16, 70); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (busArrived) {
    // ── BOARDING STATE ───────────────────────────────────────────────────
    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText('● BUSS ER HER', W / 2, 118);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText('STIG PÅ NÅ', W / 2, 190);
    // Green pulsing bar (static version — full width)
    ctx.fillStyle = '#00c853';
    ctx.beginPath(); ctx.roundRect(20, 240, W - 40, 28, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('OMBORDSTIGNING ÅPEN', W / 2, 254);

  } else if (countdown > 0) {
    // ── COUNTDOWN STATE ───────────────────────────────────────────────────
    const mins = Math.floor(countdown / 60);
    const secs = Math.ceil(countdown % 60);
    const label = mins > 0
      ? `${mins} min  ${String(secs).padStart(2,'0')} sek`
      : `${String(secs).padStart(2,'0')} sek`;

    ctx.fillStyle = '#90caf9';
    ctx.font = '22px Arial, sans-serif';
    ctx.fillText('NESTE BUSS OM', W / 2, 105);

    ctx.fillStyle = countdown <= 15 ? '#ff5252' : '#ffffff';
    ctx.font = `bold 72px "Courier New", monospace`;
    ctx.fillText(label, W / 2, 192);

    // Progress bar (fills as bus approaches)
    const totalSecs = BUS_ARRIVAL_TOTAL_SECS;
    const progress  = Math.max(0, 1 - countdown / totalSecs);
    const barW      = W - 40;
    ctx.fillStyle   = '#1a2580';
    ctx.beginPath(); ctx.roundRect(20, 248, barW, 24, 5); ctx.fill();
    ctx.fillStyle   = countdown <= 15 ? '#ff5252' : '#42a5f5';
    ctx.beginPath(); ctx.roundRect(20, 248, Math.max(8, barW * progress), 24, 5); ctx.fill();
    ctx.fillStyle   = 'rgba(255,255,255,0.55)';
    ctx.font        = 'bold 14px Arial, sans-serif';
    ctx.fillText(`${Math.round(progress * 100)}%`, W / 2, 260);

  } else {
    // ── DEPARTED STATE ────────────────────────────────────────────────────
    ctx.fillStyle = '#ff8a65';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText('BUSS PASSERT', W / 2, 130);
    ctx.fillStyle = '#78909c';
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText('Venter på neste avgang...', W / 2, 190);
    ctx.fillStyle = '#37474f';
    ctx.beginPath(); ctx.roundRect(20, 248, W - 40, 24, 5); ctx.fill();
  }

  arrivalTexture.needsUpdate = true;
}

// ---- Player mesh ----
const PLAYER_SKIN_COLORS = [0xffd5b0, 0xc68642, 0x8d5524, 0xf1c27d, 0xffe0bd];

function buildPlayerMesh() {
  const group   = new THREE.Group();
  const skin    = PLAYER_SKIN_COLORS[Math.floor(Math.random() * PLAYER_SKIN_COLORS.length)];
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1565c0 }); // blue clothing
  const headMat = new THREE.MeshLambertMaterial({ color: skin });
  const hatMat  = new THREE.MeshLambertMaterial({ color: 0x111111 }); // black top hat

  function part(geo, mat, y) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    group.add(m);
    return m;
  }

  // Body
  part(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), bodyMat, 0.70);
  part(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI*2, Math.PI/2, Math.PI/2), bodyMat, 0.25);
  part(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI*2, 0, Math.PI/2), bodyMat, 1.15);

  // Head and top hat (hidden in first-person)
  const head  = part(new THREE.SphereGeometry(0.22, 10, 10), headMat, 1.52);
  const brim  = part(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 14), hatMat, 1.75);
  const crown = part(new THREE.CylinderGeometry(0.185, 0.185, 0.44, 14), hatMat, 1.995);

  group.visible = false; // shown on game start
  scene.add(group);
  return { group, head, brim, crown };
}

const player = buildPlayerMesh();

function setPlayerViewMode(is3P) {
  player.head.visible  = is3P;
  player.brim.visible  = is3P;
  player.crown.visible = is3P;
}
setPlayerViewMode(false);

// ---- Passengers ----
// Night: 1–2 lone strangers. Day: 6–8 commuters.
const passengers = createPassengers(scene, isNight ? 1 + Math.floor(Math.random() * 2) : 6 + Math.floor(Math.random() * 3));

// ---- Inventory & world items ----
initInventory();
createBusDriver(scene);
// spawnWorldItems is called in selectMode() after difficulty is chosen

// ---- Helpers ----
function getBusWorldBox() {
  return {
    minX: busCurrentX + BUS_LOCAL_MIN_X, maxX: busCurrentX + BUS_LOCAL_MAX_X,
    minZ: BUS_Z_CENTER - BUS_HALF_WIDTH_Z, maxZ: BUS_Z_CENTER + BUS_HALF_WIDTH_Z,
  };
}

function playerIntersectsBus(px, pz, r = 0.35) {
  const b = getBusWorldBox();
  return px + r > b.minX && px - r < b.maxX && pz + r > b.minZ && pz - r < b.maxZ;
}

// Static AABB colliders (min/max in world X and Z, expanded by player radius)
const PR = 0.35; // player radius
const STATIC_BOXES = [
  // Kiosk body: KX=8.9, BW=8.8, BD=8.8 → x 4.5–13.3, z -26.9–-18.1
  { minX: 4.5  - PR, maxX: 13.3 + PR, minZ: -26.9 - PR, maxZ: -18.1 + PR },
  // Bus shelter back wall: centre (0, -13.3), width 3.5, depth 0.15
  { minX: -1.75 - PR, maxX: 1.75 + PR, minZ: -13.45 - PR, maxZ: -13.15 + PR },
];

function blocked(nx, nz) {
  if (nx < -38 || nx > 38 || nz < -35 || nz > 30) return true;
  if (playerIntersectsBus(nx, nz)) return true;
  for (const b of STATIC_BOXES) {
    if (nx > b.minX && nx < b.maxX && nz > b.minZ && nz < b.maxZ) return true;
  }
  for (const t of treeColliders) {
    const dx = nx - t.x, dz = nz - t.z;
    if (dx * dx + dz * dz < (PR + t.r) * (PR + t.r)) return true;
  }
  if (passengers.some(p => {
    if (p.boarded) return false;
    const dx = nx - p.x, dz = nz - p.z;
    return dx*dx + dz*dz < (0.35 + 0.38) ** 2;
  })) return true;
  return false;
}

function getScores() {
  try { return JSON.parse(localStorage.getItem('busStopScores')) || []; }
  catch { return []; }
}

function saveAndRenderScores(newTime) {
  const scores = getScores();
  scores.push(parseFloat(newTime));
  scores.sort((a, b) => a - b);
  const top = scores.slice(0, 5);
  localStorage.setItem('busStopScores', JSON.stringify(top));
  document.getElementById('high-scores').innerHTML =
    `<strong>${UI[uiLang].bestTimes}</strong><br>` + top.map((t, i) => `${i+1}. ${t.toFixed(2)}s`).join('<br>');
}

function resetGame() {
  gameWon      = false;
  gameKicked   = false;
  busArrived   = false;
  busAnimating = false;
  busLeaving   = false;
  pendingReset = false;
  busWaitTimer = 0;
  busCurrentX  = BUS_START_X;
  bus.position.x = BUS_START_X;
  timerSprite.visible = false;
  busArrivalCountdown = BUS_ARRIVAL_TOTAL_SECS;
  updateArrivalSign(busArrivalCountdown);

  playerX     = PLAYER_START_X;
  playerZ     = PLAYER_START_Z;
  thirdPerson = false;
  bobTimer    = 0;
  camera.position.set(PLAYER_START_X, PLAYER_HEIGHT, PLAYER_START_Z);
  camera.rotation.set(0, Math.PI, 0);

  player.group.position.set(playerX, 0, playerZ);
  setPlayerViewMode(false);

  resetPassengers(passengers);
  resetWorldItems(scene);
  resetBusDriver();
  resetInventory();
  kickAnim     = null;
  tripAnim     = null;
  tripCooldown = 0;
  sprintAccum  = 0;
  shakeTimer   = 0;
  player.group.rotation.x = 0;
  player.group.position.y = 0;
  overlay.classList.remove('hidden');
  setInventoryVisible(false);
}

function triggerDeath() {
  gameDead    = true;
  gameStarted = false;
  controls.unlock();
  deathScreen.classList.add('visible');
  setTimeout(() => {
    deathScreen.classList.remove('visible');
    setTimeout(() => { gameDead = false; resetGame(); }, 650);
  }, 2000);
}

// ── Trip-over cutscene ───────────────────────────────────────────────────────
const TRIP_DURATION = 1.6; // seconds the fall animation plays
function triggerTrip() {
  if (tripAnim) return;
  const lost = deductInventory('coin', getItemCount('coin'));
  // Even with 0 coins still play the fall animation
  if (lost > 0) spawnTripCoins(scene, playerX, playerZ, lost);
  gameStarted  = false;
  sprintAccum  = 0;
  tripCooldown = 4;  // 4 s cooldown after landing before another trip can roll

  // Show toast
  const msg = uiLang === 'no'
    ? `Du snublet! Mistet ${lost} mynt${lost !== 1 ? 'er' : ''}!`
    : `You tripped! Lost ${lost} coin${lost !== 1 ? 's' : ''}!`;
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed; top:30%; left:50%; transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.78); color:#ffd700; font-size:28px; font-weight:bold;
    padding:16px 32px; border-radius:12px; pointer-events:none; z-index:2000;
    border:2px solid #ffd700; text-align:center; white-space:nowrap;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);

  tripAnim = { timer: 0, duration: TRIP_DURATION, startRotX: 0 };
}

const doorTriggerBox = new THREE.Box3();
function updateDoorTriggerBox() {
  const cx = busCurrentX + DOOR_TRIGGER_X;
  doorTriggerBox.set(
    new THREE.Vector3(cx - DOOR_TRIGGER_SIZE, 0, DOOR_TRIGGER_Z - DOOR_TRIGGER_SIZE),
    new THREE.Vector3(cx + DOOR_TRIGGER_SIZE, 3, DOOR_TRIGGER_Z + DOOR_TRIGGER_SIZE)
  );
}

// ---- Event listeners ----
overlay.addEventListener('click', () => controls.lock());

controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  gameStarted = true;
  setInventoryVisible(true);
  player.group.visible = true;
  idleCursor.style.display = 'block';
  timerStart = performance.now();
  updateArrivalSign(busArrivalCountdown);
  if (!busAnimating && !busArrived) {
    setTimeout(() => { busAnimating = true; }, BUS_ARRIVAL_DELAY);
  }
});

controls.addEventListener('unlock', () => {
  idleCursor.style.display     = 'none';
  interactCursor.style.display = 'none';
  if (!gameWon && !gameDead && !gameKicked) {
    overlay.classList.remove('hidden');
    gameStarted = false;
    setInventoryVisible(false);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') { location.reload(); return; }
  if (e.code === 'Enter' && gameStarted && !gameWon) {
    thirdPerson = !thirdPerson;
    setPlayerViewMode(thirdPerson);
    return;
  }
  if (!gameStarted || gameWon) return;
  switch (e.code) {
    case 'KeyW': moveState.forward  = true; break;
    case 'KeyS': moveState.backward = true; break;
    case 'KeyA': moveState.left     = true; break;
    case 'KeyD': moveState.right    = true; break;
    case 'ShiftLeft': case 'ShiftRight': moveState.sprint = true; break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': moveState.forward  = false; break;
    case 'KeyS': moveState.backward = false; break;
    case 'KeyA': moveState.left     = false; break;
    case 'KeyD': moveState.right    = false; break;
    case 'ShiftLeft': case 'ShiftRight': moveState.sprint = false; break;
  }
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !gameStarted || gameWon || !controls.isLocked) return;
  if (nearestInteractable) forcePassengerChat(nearestInteractable);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Animation loop ----
const clock = new THREE.Clock();
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up    = new THREE.Vector3(0, 1, 0);
const _vel   = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta    = Math.min(rawDelta, 0.1);

  tickKickCutscene(delta);
  tickTripCutscene(delta);

  if (gameStarted && !gameWon) {

    // --- Movement ---
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    _fwd.normalize();
    _right.crossVectors(_fwd, _up).normalize();

    _vel.set(0, 0, 0);
    if (moveState.forward)  _vel.add(_fwd);
    if (moveState.backward) _vel.sub(_fwd);
    if (moveState.right)    _vel.add(_right);
    if (moveState.left)     _vel.sub(_right);

    const isMoving = _vel.length() > 0;
    if (isMoving) {
      _vel.normalize().multiplyScalar(MOVE_SPEED * (moveState.sprint ? 1.5 : 1) * delta);
      const fx = playerX + _vel.x;
      const fz = playerZ + _vel.z;
      if      (!blocked(fx, fz))          { playerX = fx; playerZ = fz; }
      else if (!blocked(fx, playerZ))       playerX = fx;
      else if (!blocked(playerX, fz))       playerZ = fz;
    }

    // --- Sprint-in-forest trip check ---
    if (tripCooldown > 0) tripCooldown -= delta;
    if (hardMode && moveState.sprint && isMoving && isInForest(playerZ)) {
      sprintAccum += delta;
      if (sprintAccum >= 1.5 && tripCooldown <= 0) {
        sprintAccum = 0;
        // Base chance 3%; scales up with coins: +0.8% per coin above 1 (10 coins → ~10.2%)
        const coins  = getItemCount('coin');
        const chance = 0.03 + Math.max(0, coins - 1) * 0.008;
        if (Math.random() < chance) triggerTrip();
      }
    } else {
      sprintAccum = Math.max(0, sprintAccum - delta * 0.5);
    }

    // --- Camera: first-person with head bob, or third-person orbit ---
    if (!thirdPerson) {
      if (isMoving) {
        bobTimer += delta * Math.PI * 4 * (moveState.sprint ? 1.5 : 1); // 2 Hz, scales with speed
        camera.position.y = PLAYER_HEIGHT + Math.sin(bobTimer) * 0.038;
      } else {
        bobTimer = 0;
        camera.position.y += (PLAYER_HEIGHT - camera.position.y) * Math.min(1, delta * 10);
      }
      camera.position.x = playerX;
      camera.position.z = playerZ;
    } else {
      // Smooth chase cam: 3.5 units behind player, 2.2 above ground
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.length() > 0.001) _fwd.normalize();
      const tpX = playerX - _fwd.x * 3.5;
      const tpZ = playerZ - _fwd.z * 3.5;
      const tpY = PLAYER_HEIGHT + 2.2;
      const s   = Math.min(1, delta * 8);
      camera.position.x += (tpX - camera.position.x) * s;
      camera.position.y += (tpY - camera.position.y) * s;
      camera.position.z += (tpZ - camera.position.z) * s;
    }

    // --- Bus arrival ---
    if (busAnimating && !busArrived) {
      busArrivalCountdown = Math.max(0, (BUS_STOP_X - busCurrentX) / BUS_TRAVEL_SPEED);
      updateArrivalSign(busArrivalCountdown);
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      if (busCurrentX >= BUS_STOP_X) {
        busCurrentX  = BUS_STOP_X;
        busArrived   = true;
        busAnimating = false;
        busWaitTimer = BUS_WAIT_DURATION;
        busArrivalCountdown = 0;
        updateArrivalSign(0);
        timerSprite.visible = true;
        updateTimerSprite(busWaitTimer);
        passengers.forEach(p => { if (p.wantsBus) p.rushing = true; });
      }
      bus.position.x = busCurrentX;
      if (playerIntersectsBus(playerX, playerZ)) { triggerDeath(); return; }
    }

    // --- Passengers (always updated for idle + bubbles) ---
    updatePassengers(passengers, delta, { x: playerX, z: playerZ }, camera,
      { arriving: busAnimating && !busArrived, busCurrentX });

    // --- World items (coins etc.) ---
    updateWorldItems(scene, playerX, playerZ, delta, gameStarted);

    // --- Arrival sign: tick countdown during pre-delay phase ---
    if (!busAnimating && !busArrived && !busLeaving) {
      busArrivalCountdown = Math.max(0, busArrivalCountdown - delta);
      updateArrivalSign(busArrivalCountdown);
    }

    // --- Bus wait countdown ---
    if (busArrived && !busLeaving) {
      syncTimerPosition();
      busWaitTimer -= delta;
      updateTimerSprite(Math.max(0, busWaitTimer));
      if (busWaitTimer <= 0) {
        busLeaving  = true;
        busArrived  = false;
        timerSprite.visible = false;
        updateArrivalSign(-1); // "departed" state
      }
    }

    // --- Bus departure ---
    if (busLeaving) {
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      bus.position.x = busCurrentX;
      syncTimerPosition(); // keep sprite pinned to departing bus
      if (playerIntersectsBus(playerX, playerZ)) { triggerDeath(); return; }
      if (busCurrentX > BUS_LEAVE_TARGET_X) {
        busLeaving    = false;
        pendingReset  = true;
        pendingResetAt = performance.now() + 1500;
      }
    }

    // --- Deferred bus reset ---
    if (pendingReset && performance.now() >= pendingResetAt) {
      pendingReset = false;
      busCurrentX  = BUS_START_X;
      bus.position.x = BUS_START_X;
      busWaitTimer = 0;
      busArrivalCountdown = BUS_ARRIVAL_TOTAL_SECS;
      updateArrivalSign(busArrivalCountdown);
      resetPassengers(passengers);
      clock.getDelta(); // drain spike
      setTimeout(() => { busAnimating = true; }, BUS_ARRIVAL_DELAY);
    }

    // --- Door / win trigger ---
    if (busArrived && !busLeaving) {
      updateDoorTriggerBox();
      const playerBox = new THREE.Box3(
        new THREE.Vector3(playerX - 0.3, 0,        playerZ - 0.3),
        new THREE.Vector3(playerX + 0.3, PLAYER_HEIGHT + 0.5, playerZ + 0.3)
      );
      if (doorTriggerBox.intersectsBox(playerBox)) {

        // ── Hard mode: need 5 coins ─────────────────────────────────────
        if (hardMode && getItemCount('coin') < 10) {
          // Freeze player, unlock pointer, start rejection sequence
          gameStarted = false;
          gameKicked  = true;
          controls.unlock();
          setInventoryVisible(false);
          timerSprite.visible = false;

          triggerRejection({
            busCurrentX,
            passengers,
            camera,
            bus,
            lang: uiLang,
            onKick: () => {
              // Start animated knockback — tickKickCutscene drives it each frame
              kickAnim = {
                startZ:   playerZ,
                targetZ:  playerZ - 5.5,   // pushed back hard
                timer:    0,
                duration: 0.7,
              };
              shakeTimer = SHAKE_DURATION;
            },
            onDone: () => {
              gameKicked = false;
              resetGame();
            },
          });
          return;
        }

        // ── Normal boarding ─────────────────────────────────────────────
        const DX = busCurrentX + 3.5, DZ = -7.5;
        const pdist = (playerX - DX) ** 2 + (playerZ - DZ) ** 2;
        const passengerAhead = passengers.some(p => {
          if (p.boarded || !p.rushing) return false;
          return (p.x - DX) ** 2 + (p.z - DZ) ** 2 < pdist;
        });
        if (!passengerAhead) {
          elapsedTime = ((performance.now() - timerStart) / 1000).toFixed(2);
          gameWon = true;
          controls.unlock();
          winScreen.querySelector('#win-message').textContent = UI[uiLang].win;
          document.getElementById('win-time').textContent    = `${UI[uiLang].timeLabel}: ${elapsedTime}s`;
          saveAndRenderScores(elapsedTime);
          winScreen.classList.add('visible');
        }
      }
    }

    // --- Proximity cursor (close + facing passenger) ---
    {
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.length() > 0.001) _fwd.normalize();
      let closest = null, closestD = INTERACT_DIST_SQ;
      for (const p of passengers) {
        if (p.boarded) continue;
        const dx = p.x - playerX, dz = p.z - playerZ;
        const d = dx*dx + dz*dz;
        if (d >= closestD) continue;
        // Dot product: passenger must be within ~50° of camera facing
        const len = Math.sqrt(d);
        const dot = (dx / len) * _fwd.x + (dz / len) * _fwd.z;
        if (dot > 0.64) { closestD = d; closest = p; } // cos(50°)≈0.64
      }
      nearestInteractable = closest;
      interactCursor.style.display = closest ? 'block' : 'none';
    }

    // --- Player mesh: position + yaw ----
    player.group.position.set(playerX, 0, playerZ);
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.length() > 0.001) {
      _fwd.normalize();
      player.group.rotation.y = Math.atan2(_fwd.x, _fwd.z);
    }
  }

  // --- Border wall proximity fade ---
  {
    const FADE_START = 8;  // distance at which wall starts appearing
    const FADE_END   = 2;  // distance at which wall is fully opaque
    for (const w of borderWalls) {
      const dist = w.axis === 'x'
        ? Math.abs(playerX - w.limit)
        : Math.abs(playerZ - w.limit);
      const t = 1 - Math.min(1, Math.max(0, (dist - FADE_END) / (FADE_START - FADE_END)));
      w.mat.opacity = t * borderMaxOpacity;
    }
  }

  renderer.render(scene, camera);
  updateScene(delta, scene);
}

// ─── Rejection cutscene update (runs outside normal gameStarted gate) ───────
function tickKickCutscene(delta) {
  if (!gameKicked) return;

  // ── Knockback animation ───────────────────────────────────────────────────
  if (kickAnim) {
    kickAnim.timer += delta;
    const t  = Math.min(1, kickAnim.timer / kickAnim.duration);
    const et = 1 - Math.pow(1 - t, 3);   // ease-out cubic: fast launch, slow settle
    playerZ  = kickAnim.startZ + (kickAnim.targetZ - kickAnim.startZ) * et;

    // Player body tilts backward (visible in 3rd person; also "felt" through camera)
    player.group.rotation.x = Math.sin(t * Math.PI * 0.8) * 0.5;
    player.group.position.set(playerX, Math.sin(t * Math.PI) * -0.10, playerZ);

    if (t >= 1) {
      player.group.rotation.x = 0;
      player.group.position.y = 0;
      kickAnim = null;
    }
  } else {
    player.group.position.set(playerX, 0, playerZ);
  }

  // ── Screen shake ─────────────────────────────────────────────────────────
  const shakeAmt = shakeTimer > 0 ? (shakeTimer / SHAKE_DURATION) : 0;
  shakeTimer = Math.max(0, shakeTimer - delta);

  // ── Camera position (follows player + shake) ─────────────────────────────
  camera.position.set(
    playerX + (shakeAmt > 0 ? (Math.random() - 0.5) * 0.14 * shakeAmt : 0),
    PLAYER_HEIGHT + (shakeAmt > 0 ? (Math.random() - 0.5) * 0.10 * shakeAmt : 0),
    playerZ,
  );

  // ── Bus departure: waits 1 s after cutscene starts, then floors it ────────
  if (shouldDriveBus()) {
    busCurrentX   += BUS_KICK_DEPART_SPEED * delta;
    bus.position.x = busCurrentX;
  }

  // ── busDriver: leg animation + camera rotation toward door/bus ───────────
  updateBusDriver(delta, camera, busCurrentX);
}

// ─── Trip cutscene (runs outside normal gameStarted gate) ────────────────────
function tickTripCutscene(delta) {
  if (!tripAnim) return;
  tripAnim.timer += delta;
  const t = Math.min(1, tripAnim.timer / tripAnim.duration);

  // Phase 1 (0–0.35): pitch forward fast
  // Phase 2 (0.35–0.75): lie flat
  // Phase 3 (0.75–1.0): get back up
  let rotX;
  if (t < 0.35) {
    rotX = (t / 0.35) * (Math.PI / 2);
  } else if (t < 0.75) {
    rotX = Math.PI / 2;
  } else {
    rotX = (1 - (t - 0.75) / 0.25) * (Math.PI / 2);
  }

  // Player mesh mirrors the fall — clamp y so it never clips through the ground
  player.group.rotation.x = rotX;
  player.group.position.set(playerX, Math.max(0, -Math.sin(rotX) * 0.3), playerZ);

  if (thirdPerson) {
    // Chase cam continues normally — player sees the character face-plant from behind
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.length() > 0.001) _fwd.normalize();
    const tpX = playerX - _fwd.x * 3.5;
    const tpZ = playerZ - _fwd.z * 3.5;
    const tpY = PLAYER_HEIGHT + 2.2;
    const s   = Math.min(1, delta * 8);
    camera.position.x += (tpX - camera.position.x) * s;
    camera.position.y += (tpY - camera.position.y) * s;
    camera.position.z += (tpZ - camera.position.z) * s;
  } else {
    // First-person: lower camera to ground (face-plant effect)
    // Don't touch euler.x — PointerLockControls resets it every frame.
    camera.position.set(
      playerX,
      Math.max(0.15, PLAYER_HEIGHT - Math.sin(rotX) * 1.55),
      playerZ,
    );
  }

  if (t >= 1) {
    tripAnim    = null;
    sprintAccum = 0;
    player.group.rotation.x = 0;
    player.group.position.y = 0;
    gameStarted = true;
  }
}

animate();
