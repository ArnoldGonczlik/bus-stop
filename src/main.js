import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createScene, updateScene } from './scene.js';
import { createBus } from './bus.js';
import { createPassengers, resetPassengers, updatePassengers, forcePassengerChat, setLanguage, setNightMode } from './passengers.js';

// ---- UI translations ----
const UI = {
  no: {
    start:      'Klikk for å starte',
    win:        'Du tok bussen!',
    winRestart: 'Trykk R for å starte på nytt',
    death:      'Du ble overkjørt...',
    bestTimes:  'Beste tider',
    timeLabel:  'Tid',
  },
  en: {
    start:      'Click to start',
    win:        'You caught the bus!',
    winRestart: 'Press R to restart',
    death:      'You died...',
    bestTimes:  'Best Times',
    timeLabel:  'Time',
  },
};
let uiLang = 'no';

function applyLang(lang) {
  uiLang = lang;
  setLanguage(lang);
  const t = UI[lang];
  document.getElementById('start-message').textContent  = t.start;
  document.getElementById('win-restart').textContent    = t.winRestart;
  document.getElementById('death-message').textContent  = t.death;
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLang(btn.dataset.lang));
});

// ---- Constants ----
const PLAYER_HEIGHT  = 1.7;
const PLAYER_START_X = 0;
const PLAYER_START_Z = -15;
const MOVE_SPEED     = 3.2;

const BUS_ARRIVAL_DELAY  = 6000;
const BUS_START_X        = -120;
const BUS_STOP_X         = 0;
const BUS_TRAVEL_SPEED   = 4.5;
const BUS_LEAVE_TARGET_X = 120;
const BUS_WAIT_DURATION  = 15;

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

let busArrived  = false;
let busAnimating = false;
let busCurrentX  = BUS_START_X;
let busWaitTimer = 0;
let busLeaving   = false;
let pendingReset = false;
let pendingResetAt = 0;

let timerStart  = 0;
let elapsedTime = 0;

// Player position — decoupled from camera so third-person works
let playerX = PLAYER_START_X;
let playerZ = PLAYER_START_Z;
let thirdPerson = false;
let bobTimer    = 0;

const moveState = { forward: false, backward: false, left: false, right: false };

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

const { ground, roadBounds, isNight } = createScene(scene);
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
  // Kiosk body: centre (7, -20), half-size (2.5, 1.75)
  { minX: 4.5  - PR, maxX: 9.5  + PR, minZ: -21.75 - PR, maxZ: -18.25 + PR },
  // Bus shelter back wall: centre (0, -13.3), width 3.5, depth 0.15
  { minX: -1.75 - PR, maxX: 1.75 + PR, minZ: -13.45 - PR, maxZ: -13.15 + PR },
];

function blocked(nx, nz) {
  if (nx < -25 || nx > 25 || nz < -20 || nz > 10) return true;
  if (playerIntersectsBus(nx, nz)) return true;
  for (const b of STATIC_BOXES) {
    if (nx > b.minX && nx < b.maxX && nz > b.minZ && nz < b.maxZ) return true;
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
  busArrived   = false;
  busAnimating = false;
  busLeaving   = false;
  pendingReset = false;
  busWaitTimer = 0;
  busCurrentX  = BUS_START_X;
  bus.position.x = BUS_START_X;
  timerSprite.visible = false;

  playerX     = PLAYER_START_X;
  playerZ     = PLAYER_START_Z;
  thirdPerson = false;
  bobTimer    = 0;
  camera.position.set(PLAYER_START_X, PLAYER_HEIGHT, PLAYER_START_Z);
  camera.rotation.set(0, Math.PI, 0);

  player.group.position.set(playerX, 0, playerZ);
  setPlayerViewMode(false);

  resetPassengers(passengers);
  overlay.classList.remove('hidden');
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
  player.group.visible = true;
  idleCursor.style.display = 'block';
  timerStart = performance.now();
  if (!busAnimating && !busArrived) {
    setTimeout(() => { busAnimating = true; }, BUS_ARRIVAL_DELAY);
  }
});

controls.addEventListener('unlock', () => {
  idleCursor.style.display     = 'none';
  interactCursor.style.display = 'none';
  if (!gameWon && !gameDead) {
    overlay.classList.remove('hidden');
    gameStarted = false;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && gameWon) {
    winScreen.classList.remove('visible');
    gameWon = false;
    resetGame();
    return;
  }
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
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': moveState.forward  = false; break;
    case 'KeyS': moveState.backward = false; break;
    case 'KeyA': moveState.left     = false; break;
    case 'KeyD': moveState.right    = false; break;
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
const _fwd   = new THREE.Vector3(); // reusable — avoids allocation per frame

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta    = Math.min(rawDelta, 0.1);

  if (gameStarted && !gameWon) {

    // --- Movement ---
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    _fwd.normalize();
    const right = new THREE.Vector3().crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize();

    const vel = new THREE.Vector3();
    if (moveState.forward)  vel.add(_fwd);
    if (moveState.backward) vel.sub(_fwd);
    if (moveState.right)    vel.add(right);
    if (moveState.left)     vel.sub(right);

    const isMoving = vel.length() > 0;
    if (isMoving) {
      vel.normalize().multiplyScalar(MOVE_SPEED * delta);
      const fx = playerX + vel.x;
      const fz = playerZ + vel.z;
      if      (!blocked(fx, fz))          { playerX = fx; playerZ = fz; }
      else if (!blocked(fx, playerZ))       playerX = fx;
      else if (!blocked(playerX, fz))       playerZ = fz;
    }

    // --- Camera: first-person with head bob, or third-person orbit ---
    if (!thirdPerson) {
      if (isMoving) {
        bobTimer += delta * Math.PI * 4; // 2 Hz
        camera.position.y = PLAYER_HEIGHT + Math.sin(bobTimer) * 0.038;
      } else {
        bobTimer = 0;
        camera.position.y += (PLAYER_HEIGHT - camera.position.y) * Math.min(1, delta * 10);
      }
      camera.position.x = playerX;
      camera.position.z = playerZ;
    } else {
      // Smooth chase cam: 5 units behind player, 2.2 above ground
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.length() > 0.001) _fwd.normalize();
      const tpX = playerX - _fwd.x * 5;
      const tpZ = playerZ - _fwd.z * 5;
      const tpY = PLAYER_HEIGHT + 2.2;
      const s   = Math.min(1, delta * 8);
      camera.position.x += (tpX - camera.position.x) * s;
      camera.position.y += (tpY - camera.position.y) * s;
      camera.position.z += (tpZ - camera.position.z) * s;
    }

    // --- Bus arrival ---
    if (busAnimating && !busArrived) {
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      if (busCurrentX >= BUS_STOP_X) {
        busCurrentX  = BUS_STOP_X;
        busArrived   = true;
        busAnimating = false;
        busWaitTimer = BUS_WAIT_DURATION;
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

    // --- Bus wait countdown ---
    if (busArrived && !busLeaving) {
      syncTimerPosition();
      busWaitTimer -= delta;
      updateTimerSprite(Math.max(0, busWaitTimer));
      if (busWaitTimer <= 0) {
        busLeaving  = true;
        busArrived  = false;
        timerSprite.visible = false;
      }
    }

    // --- Bus departure ---
    if (busLeaving) {
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      bus.position.x = busCurrentX;
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
      resetPassengers(passengers);
      clock.getDelta(); // drain spike
      busAnimating = true;
    }

    // --- Door / win trigger ---
    if (busArrived && !busLeaving) {
      updateDoorTriggerBox();
      const playerBox = new THREE.Box3(
        new THREE.Vector3(playerX - 0.3, 0,        playerZ - 0.3),
        new THREE.Vector3(playerX + 0.3, PLAYER_HEIGHT + 0.5, playerZ + 0.3)
      );
      if (doorTriggerBox.intersectsBox(playerBox)) {
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

  renderer.render(scene, camera);
  updateScene(delta, scene);
}

animate();
