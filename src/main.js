import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createScene } from './scene.js';
import { createBus } from './bus.js';

// Constants
const PLAYER_HEIGHT = 1.7;
const PLAYER_START_X = 0;
const PLAYER_START_Z = -15;
const MOVE_SPEED = 5.0;
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
let busArrived = false;
let busAnimating = false;
let busCurrentX = BUS_START_X;

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
camera.rotation.y = Math.PI; // Face north toward road and forest

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

// Create scene elements
const { ground, roadBounds } = createScene(scene);

// Create bus
const bus = createBus();
bus.position.set(BUS_START_X, 0, -6);
scene.add(bus);

// Door trigger zone
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
  
  // Start bus arrival after delay
  setTimeout(() => {
    busAnimating = true;
  }, BUS_ARRIVAL_DELAY);
});

controls.addEventListener('unlock', () => {
  if (!gameWon) {
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
      if (newPosition.x > -25 && newPosition.x < 25 &&
          newPosition.z > -20 && newPosition.z < 10) {
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
      }
      
      bus.position.x = busCurrentX;
    }
    
    // Check door trigger
    if (busArrived) {
      const playerBox = new THREE.Box3(
        new THREE.Vector3(camera.position.x - 0.3, camera.position.y - PLAYER_HEIGHT, camera.position.z - 0.3),
        new THREE.Vector3(camera.position.x + 0.3, camera.position.y + 0.5, camera.position.z + 0.3)
      );
      
      if (doorTriggerBox.intersectsBox(playerBox)) {
        // Win condition
        gameWon = true;
        controls.unlock();
        winScreen.classList.add('visible');
      }
    }
  }
  
  renderer.render(scene, camera);
}

animate();

