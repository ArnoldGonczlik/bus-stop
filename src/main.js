import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createScene } from './scene.js';
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
const DOOR_TRIGGER_SIZE = 1.5;

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
  busCurrentX = BUS_START_X;
  bus.position.x = BUS_START_X;
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
const doorTriggerBox = new THREE.Box3(
  new THREE.Vector3(DOOR_TRIGGER_X - DOOR_TRIGGER_SIZE, 0, DOOR_TRIGGER_Z - DOOR_TRIGGER_SIZE),
  new THREE.Vector3(DOOR_TRIGGER_X + DOOR_TRIGGER_SIZE, 3, DOOR_TRIGGER_Z + DOOR_TRIGGER_SIZE)
);

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
  
  const delta = clock.getDelta();
  
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
      
      const newPosition = camera.position.clone().add(velocity);
      
      // Simple boundary constraints
      const inBounds = newPosition.x > -25 && newPosition.x < 25 &&
                       newPosition.z > -20 && newPosition.z < 10;

      // Bus solid collision: block if new position is inside bus body
      const hitsBus = playerIntersectsBus(newPosition.x, newPosition.z);

      // Passenger collision
      const hitsPassenger = passengers.some(p => {
        if (p.boarded) return false;
        const dx = newPosition.x - p.x;
        const dz = newPosition.z - p.z;
        return Math.sqrt(dx * dx + dz * dz) < 0.35 + 0.38;
      });

      if (inBounds && !hitsBus && !hitsPassenger) {
        camera.position.add(velocity);
      }
    }
    
    // Animate bus arrival
    if (busAnimating && !busArrived) {
      busCurrentX += BUS_TRAVEL_SPEED * delta;
      
      if (busCurrentX >= BUS_STOP_X) {
        busCurrentX = BUS_STOP_X;
        busArrived = true;
        busAnimating = false;
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
    if (busArrived) {
      const playerPos = { x: camera.position.x, z: camera.position.z };
      updatePassengers(passengers, delta, playerPos);
    }

    // Check door trigger
    if (busArrived) {
      const playerBox = new THREE.Box3(
        new THREE.Vector3(camera.position.x - 0.3, camera.position.y - PLAYER_HEIGHT, camera.position.z - 0.3),
        new THREE.Vector3(camera.position.x + 0.3, camera.position.y + 0.5, camera.position.z + 0.3)
      );
      
      if (doorTriggerBox.intersectsBox(playerBox)) {
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
  
  renderer.render(scene, camera);
}

animate();

