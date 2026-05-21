import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createScene, updateScene } from './scene.js';
import { createBus } from './bus.js';
import { createPassengers, resetPassengers, updatePassengers } from './passengers.js';

// Constants
const PLAYER_HEIGHT = 1.7;
const PLAYER_START_X = 0;
const PLAYER_START_Z = -15;
const MOVE_SPEED = 3.2;
const BUS_ARRIVAL_DELAY = 2000;
const BUS_START_X = -80;
const BUS_STOP_X = 0;
const BUS_TRAVEL_SPEED = 8.0;
const DOOR_TRIGGER_X = 3.5; // Aligned with door frame position on bus
const DOOR_TRIGGER_Z = -7.5; // Slightly outside the bus on player's side
const DOOR_TRIGGER_SIZE = 0.6; // smaller hitbox

// Bus departure timer
const BUS_WAIT_DURATION = 15; // seconds bus waits before leaving
let busWaitTimer = 0;
let busLeaving = false;
let pendingReset = false;
let pendingResetAt = 0;
const BUS_LEAVE_TARGET_X = 120;

// State
let gameStarted = false;
let gameWon = false;
let gameDead = false;
let busArrived = false;
let busAnimating = false;
let busCurrentX = BUS_START_X;
let timerStart = 0;
let elapsedTime = 0;

// Movement state
const moveState = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

// Setup
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 20, 80);
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(PLAYER_START_X, PLAYER_HEIGHT, PLAYER_START_Z);
camera.rotation.y = Math.PI; // Face +Z toward road

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Controls
const controls = new PointerLockControls(camera, document.body);

// UI elements
const overlay = document.getElementById('overlay');
const winScreen = document.getElementById('win-screen');
const deathScreen = document.getElementById('death-screen');

// Create scene elements
const { ground, roadBounds } = createScene(scene);

// Create bus
const bus = createBus();
bus.position.set(BUS_START_X, 0, -6);
scene.add(bus);

const timerCanvas = document.createElement('canvas');
timerCanvas.width = 256;
timerCanvas.height = 82;
const timerCtx = timerCanvas.getContext('2d');
const timerTexture = new THREE.CanvasTexture(timerCanvas);
// No UV flips — mirroring handled in canvas draw
const timerMat = new THREE.MeshBasicMaterial({ map: timerTexture, side: THREE.FrontSide });
const timerPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), timerMat);
// Rotated to face -Z (toward player). Added directly to scene, not bus group,
// so we can set its world orientation freely. Position synced to bus each frame.
timerPlane.rotation.y = Math.PI;
timerPlane.visible = false;
scene.add(timerPlane);

function syncTimerPosition() {
  timerPlane.position.set(busCurrentX + 3.5, 2.5, -6 + (-1.585));
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

// Alias so the rest of the code referencing timerSprite still works
const timerSprite = timerPlane;

// Create passengers
const passengers = createPassengers(scene, 4);

// Bus bounding box in local space (approximate full body footprint)
const BUS_LOCAL_MIN_X = -5.0;
const BUS_LOCAL_MAX_X = 6.6;
const BUS_Z_CENTER = -6;
const BUS_HALF_WIDTH_Z = 1.5; // half-depth of bus body

function getBusWorldBox() {
  return {
    minX: busCurrentX + BUS_LOCAL_MIN_X,
    maxX: busCurrentX + BUS_LOCAL_MAX_X,
    minZ: BUS_Z_CENTER - BUS_HALF_WIDTH_Z,
    maxZ: BUS_Z_CENTER + BUS_HALF_WIDTH_Z
  };
}

function playerIntersectsBus(px, pz, r = 0.35) {
  const b = getBusWorldBox();
  return px + r > b.minX && px - r < b.maxX &&
         pz + r > b.minZ && pz - r < b.maxZ;
}

function getScores() {
  try {
    return JSON.parse(localStorage.getItem('busStopScores')) || [];
  } catch {
    return [];
  }
}

function saveAndRenderScores(newTime) {
  const scores = getScores();
  scores.push(parseFloat(newTime));
  scores.sort((a, b) => a - b);
  const top = scores.slice(0, 5);
  localStorage.setItem('busStopScores', JSON.stringify(top));

  const el = document.getElementById('high-scores');
  el.innerHTML = '<strong>Best Times</strong><br>' +
    top.map((t, i) => `${i + 1}. ${t.toFixed(2)}s`).join('<br>');
}

function resetGame() {
  gameWon = false;
  busArrived = false;
  busAnimating = false;
  busLeaving = false;
  pendingReset = false;
  busWaitTimer = 0;
  busCurrentX = BUS_START_X;
  bus.position.x = BUS_START_X;
  timerSprite.visible = false;
  camera.position.set(PLAYER_START_X, PLAYER_HEIGHT, PLAYER_START_Z);
  camera.rotation.set(0, Math.PI, 0);
  resetPassengers(passengers);
  overlay.classList.remove('hidden');
}

function triggerDeath() {
  gameDead = true;
  gameStarted = false;
  controls.unlock();
  deathScreen.classList.add('visible');
  setTimeout(() => {
    deathScreen.classList.remove('visible');
    setTimeout(() => {
      gameDead = false;
      resetGame();
    }, 650);
  }, 2000);
}
const doorTriggerBox = new THREE.Box3();

function updateDoorTriggerBox() {
  const cx = busCurrentX + DOOR_TRIGGER_X;
  const cz = DOOR_TRIGGER_Z;
  doorTriggerBox.set(
    new THREE.Vector3(cx - DOOR_TRIGGER_SIZE, 0, cz - DOOR_TRIGGER_SIZE),
    new THREE.Vector3(cx + DOOR_TRIGGER_SIZE, 3, cz + DOOR_TRIGGER_SIZE)
  );
}

// Start game on click
overlay.addEventListener('click', () => {
  controls.lock();
});

controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  gameStarted = true;
  timerStart = performance.now();

  // Only start bus if it hasn't been dispatched yet this round
  if (!busAnimating && !busArrived) {
    setTimeout(() => {
      busAnimating = true;
    }, BUS_ARRIVAL_DELAY);
  }
});

controls.addEventListener('unlock', () => {
  if (!gameWon && !gameDead) {
    overlay.classList.remove('hidden');
    gameStarted = false;
  }
});

// Keyboard input
window.addEventListener('keydown', (e) => {
  // Restart from win screen with R
  if (e.code === 'KeyR' && gameWon) {
    winScreen.classList.remove('visible');
    gameWon = false;
    resetGame();
    return;
  }

  if (!gameStarted || gameWon) return;
  
  switch(e.code) {
    case 'KeyW':
      moveState.forward = true;
      break;
    case 'KeyS':
      moveState.backward = true;
      break;
    case 'KeyA':
      moveState.left = true;
      break;
    case 'KeyD':
      moveState.right = true;
      break;
  }
});

window.addEventListener('keyup', (e) => {
  switch(e.code) {
    case 'KeyW':
      moveState.forward = false;
      break;
    case 'KeyS':
      moveState.backward = false;
      break;
    case 'KeyA':
      moveState.left = false;
      break;
    case 'KeyD':
      moveState.right = false;
      break;
  }
});

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.1); // clamp to prevent huge delta spikes after pauses

  if (gameStarted && !gameWon) {
    // Handle movement
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    
    if (moveState.forward) velocity.add(direction);
    if (moveState.backward) velocity.sub(direction);
    if (moveState.right) velocity.add(right);
    if (moveState.left) velocity.sub(right);
    
    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(MOVE_SPEED * delta);

      const pos = camera.position;

      function blocked(nx, nz) {
        if (nx < -25 || nx > 25 || nz < -20 || nz > 10) return true;
        if (playerIntersectsBus(nx, nz)) return true;
        if (passengers.some(p => {
          if (p.boarded) return false;
          const dx = nx - p.x, dz = nz - p.z;
          return dx * dx + dz * dz < (0.35 + 0.38) * (0.35 + 0.38);
        })) return true;
        return false;
      }

      const fx = pos.x + velocity.x;
      const fz = pos.z + velocity.z;
      if (!blocked(fx, fz)) {
        pos.x = fx;
        pos.z = fz;
      } else {
        if (!blocked(fx, pos.z)) pos.x = fx;
        if (!blocked(pos.x, fz)) pos.z = fz;
      }
    }
    
    // Animate bus arrival
    if (busAnimating && !busArrived) {
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      
      if (busCurrentX >= BUS_STOP_X) {
        busCurrentX = BUS_STOP_X;
        busArrived = true;
        busAnimating = false;
        busWaitTimer = BUS_WAIT_DURATION;
        timerSprite.visible = true;
        updateTimerSprite(busWaitTimer);
        // Tell passengers to start moving
        passengers.forEach(p => { p.rushing = true; });
      }
      
      bus.position.x = busCurrentX;

      // Trigger death screen if moving bus hits player
      if (playerIntersectsBus(camera.position.x, camera.position.z)) {
        triggerDeath();
        return;
      }
    }

    // Update passengers
    if (busArrived && !busLeaving) {
      syncTimerPosition();
      const playerPos = { x: camera.position.x, z: camera.position.z };
      updatePassengers(passengers, delta, playerPos);

      // Count down departure timer
      busWaitTimer -= delta;
      updateTimerSprite(Math.max(0, busWaitTimer));
      if (busWaitTimer <= 0) {
        busLeaving = true;
        busArrived = false;
        timerSprite.visible = false;
      }
    }

    // Bus leaving animation
    if (busLeaving) {
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      bus.position.x = busCurrentX;

      // Kill player if the departing bus runs them over
      if (playerIntersectsBus(camera.position.x, camera.position.z)) {
        triggerDeath();
        return;
      }

      if (busCurrentX > BUS_LEAVE_TARGET_X) {
        busLeaving = false;
        pendingReset = true;
        pendingResetAt = performance.now() + 1500;
      }
    }

    // Deferred bus reset — handled in-loop so delta is properly drained
    if (pendingReset && performance.now() >= pendingResetAt) {
      pendingReset = false;
      busCurrentX = BUS_START_X;
      bus.position.x = BUS_START_X;
      busWaitTimer = 0;
      resetPassengers(passengers);
      // Drain accumulated clock delta before starting bus animation
      clock.getDelta();
      busAnimating = true;
    }

    // Check door trigger — only allowed if no passenger is waiting ahead in queue
    if (busArrived && !busLeaving) {
      updateDoorTriggerBox();
      const playerBox = new THREE.Box3(
        new THREE.Vector3(camera.position.x - 0.3, camera.position.y - PLAYER_HEIGHT, camera.position.z - 0.3),
        new THREE.Vector3(camera.position.x + 0.3, camera.position.y + 0.5, camera.position.z + 0.3)
      );
      
      if (doorTriggerBox.intersectsBox(playerBox)) {
        // Block only if any rushing passenger is closer to the door than the player
        const DOOR_X = busCurrentX + 3.5;
        const DOOR_Z = -7.5;
        const playerDist = (camera.position.x - DOOR_X) ** 2 + (camera.position.z - DOOR_Z) ** 2;
        const passengerAhead = passengers.some(p => {
          if (p.boarded || !p.rushing) return false;
          const pDist = (p.x - DOOR_X) ** 2 + (p.z - DOOR_Z) ** 2;
          return pDist < playerDist;
        });
        if (!passengerAhead) {
          // Win condition
          elapsedTime = ((performance.now() - timerStart) / 1000).toFixed(2);
          gameWon = true;
          controls.unlock();
          winScreen.querySelector('#win-message').textContent = 'You caught the bus!';
          document.getElementById('win-time').textContent = `Time: ${elapsedTime}s`;
          saveAndRenderScores(elapsedTime);
          winScreen.classList.add('visible');
        }
      }
    }
  }
  
  renderer.render(scene, camera);
  updateScene(delta, scene);
}

animate();

