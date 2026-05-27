import * as THREE from 'three';
import { addToInventory, getItemDef } from './inventory.js';

// Each entry: { mesh, itemId, baseY, collected, spawnX, spawnY, spawnZ }
const worldItems = [];

let hardMode = false;
export function setHardMode(val) { hardMode = val; }

const PICKUP_DIST_SQ = 1.3 * 1.3;

/** Create one coin mesh and register it */
function createCoin(scene, x, y, z) {
  const group = new THREE.Group();

  // Coin body — flat cylinder
  const coinGeo  = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20);
  const coinMat  = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xAA8800, emissiveIntensity: 0.4 });
  const coinMesh = new THREE.Mesh(coinGeo, coinMat);
  coinMesh.castShadow = true;
  group.add(coinMesh);

  // Thin edge ring for a bit more detail
  const rimGeo = new THREE.TorusGeometry(0.22, 0.018, 8, 20);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xFFBB00, emissive: 0x886600, emissiveIntensity: 0.3 });
  const rim    = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  group.position.set(x, y, z);
  // Tilt 90° so it stands upright (face visible from first-person)
  group.rotation.z = Math.PI / 2;

  scene.add(group);

  worldItems.push({
    mesh:     group,
    itemId:   'coin',
    baseY:    y,
    collected: false,
    spawnX:   x,
    spawnY:   y,
    spawnZ:   z,
    rotOffset: Math.random() * Math.PI * 2,
  });
}

/**
 * Spawn all world items.
 * Coins only spawn in hard mode.
 * To add more item types in the future, add a createXxx() call here.
 */
export function spawnWorldItems(scene) {
  if (!hardMode) return;
  // --- Coins ---
  createCoin(scene,  2.0, 0.55, -12.5);   // near bench by bus shelter
  createCoin(scene, -1.5, 0.55, -11.8);   // left side of sidewalk
  createCoin(scene,  4.5, 0.55, -16.2);   // along gravel path to kiosk
  createCoin(scene,  0.5, 0.55, -14.0);   // central pavement
  createCoin(scene, -3.0, 0.55, -13.2);   // far left side
  createCoin(scene,  3.0, 0.55, -17.5);   // near kiosk
  createCoin(scene, -0.5, 0.55, -10.5);   // close to shelter
}

/** Call every frame. Animates items and checks for pickup. */
export function updateWorldItems(scene, playerX, playerZ, delta, gameStarted) {
  const t = performance.now() / 1000;

  for (const item of worldItems) {
    if (item.collected) continue;

    // Bob up/down and spin
    item.mesh.position.y = item.baseY + Math.sin(t * 2.2 + item.rotOffset) * 0.08;
    item.mesh.rotation.y = t * 2.5 + item.rotOffset;

    // Pickup check (only when game is running)
    if (!gameStarted) continue;
    const dx = playerX - item.spawnX;
    const dz = playerZ - item.spawnZ;
    if (dx * dx + dz * dz < PICKUP_DIST_SQ) {
      const added = addToInventory(item.itemId);
      if (added) {
        item.collected = true;
        scene.remove(item.mesh);
      }
    }
  }
}

/** Re-adds all collected items back to the scene (call on game reset). */
export function resetWorldItems(scene) {
  for (const item of worldItems) {
    if (item.collected) {
      item.collected = false;
      item.mesh.position.set(item.spawnX, item.spawnY, item.spawnZ);
      scene.add(item.mesh);
    }
  }
}

