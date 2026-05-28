import * as THREE from 'three';
import { addToInventory } from './inventory.js';

// Each entry: { mesh, itemId, baseY, collected, x, z, rotOffset, respawnTimer }
const worldItems = [];

let hardMode = false;
export function setHardMode(val) { hardMode = val; }

const PICKUP_DIST_SQ  = 1.3 * 1.3;
// 15 coins total = GRID_COLS × GRID_ROWS
const MIN_SPACING     = 2.8;
const RESPAWN_DELAY   = 10;    // seconds before a collected coin reappears

// ── Walkable-area rejection test ────────────────────────────────────────────
function isBlocked(x, z) {
  if (x < -36 || x > 36 || z < -34 || z > 29) return true;
  // Road: z -10 to -2 (full width)
  if (z > -10.5 && z < -2) return true;
  // Kiosk body + margin
  if (x > 4.0 && x < 13.8 && z > -27.2 && z < -17.8) return true;
  // Bus shelter back wall
  if (x > -2.1 && x < 2.1 && z > -13.6 && z < -12.8) return true;
  // Bollard strip
  if (z > -10.6 && z < -9.6) return true;
  return false;
}

// ── Stratified random position: divides map into a grid, picks one cell per coin ──
// This guarantees even coverage across the full walkable area.
const GRID_COLS = 5, GRID_ROWS = 3;  // 15 cells = COIN_COUNT
// Walkable bbox (matching main.js bounds, avoiding the road gap)
// We split into two z-bands: back (-34…-10.5) and front (-2…+29), weighted by area.
const BANDS = [
  { zMin: -34, zMax: -10.5 },   // behind road  (23.5 units deep)
  { zMin:  -2, zMax:  29   },   // in front of road (31 units deep)
];
const BAND_AREAS  = BANDS.map(b => b.zMax - b.zMin);          // [23.5, 31]
const TOTAL_AREA  = BAND_AREAS.reduce((s, a) => s + a, 0);    // 54.5

function randomCoinPos(existing) {
  // Pick band weighted by area, then a random point within it
  for (let attempt = 0; attempt < 400; attempt++) {
    const r    = Math.random() * TOTAL_AREA;
    const band = r < BAND_AREAS[0] ? BANDS[0] : BANDS[1];
    const x    = -35 + Math.random() * 70;
    const z    = band.zMin + Math.random() * (band.zMax - band.zMin);
    if (isBlocked(x, z)) continue;
    let tooClose = false;
    for (const e of existing) {
      const dx = x - e.x, dz = z - e.z;
      if (dx * dx + dz * dz < MIN_SPACING * MIN_SPACING) { tooClose = true; break; }
    }
    if (!tooClose) return { x, z };
  }
  return { x: -4 + Math.random() * 8, z: -12 };
}

// ── Stratified initial placement: evenly seeds coins across the map ──────────
function stratifiedCoinPositions() {
  // Divide the two bands into a 5×3 grid of cells (15 total = COIN_COUNT).
  // Each coin is placed randomly within its assigned cell.
  const X_MIN = -34, X_MAX = 34, X_RANGE = X_MAX - X_MIN;
  const cellW = X_RANGE / GRID_COLS;

  // Assign rows to bands proportionally
  const backRows  = Math.round(GRID_ROWS * BAND_AREAS[0] / TOTAL_AREA); // ~1
  const frontRows = GRID_ROWS - backRows;                                 // ~2

  function bandRows(band, numRows) {
    const rowH = (band.zMax - band.zMin) / numRows;
    return Array.from({ length: numRows }, (_, r) => ({
      zMin: band.zMin + r * rowH,
      zMax: band.zMin + (r + 1) * rowH,
    }));
  }

  const rows = [...bandRows(BANDS[0], backRows), ...bandRows(BANDS[1], frontRows)];
  const positions = [];

  for (const row of rows) {
    for (let c = 0; c < GRID_COLS; c++) {
      const xMin = X_MIN + c * cellW;
      const xMax = xMin + cellW;
      let placed = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const x = xMin + Math.random() * (xMax - xMin);
        const z = row.zMin + Math.random() * (row.zMax - row.zMin);
        if (isBlocked(x, z)) continue;
        let tooClose = false;
        for (const e of positions) {
          const dx = x - e.x, dz = z - e.z;
          if (dx * dx + dz * dz < MIN_SPACING * MIN_SPACING) { tooClose = true; break; }
        }
        if (!tooClose) { positions.push({ x, z }); placed = true; break; }
      }
      // Fallback: unconstrained random in this cell
      if (!placed) {
        const fb = randomCoinPos(positions);
        positions.push(fb);
      }
    }
  }
  return positions;
}

// ── Coin mesh factory ────────────────────────────────────────────────────────
function buildCoinMesh(scene, x, z) {
  const group   = new THREE.Group();
  const coinGeo = new THREE.CylinderGeometry(0.154, 0.154, 0.042, 20);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xAA8800, emissiveIntensity: 0.4 });
  const coinMesh = new THREE.Mesh(coinGeo, coinMat);
  coinMesh.castShadow = true;
  group.add(coinMesh);

  const rimGeo = new THREE.TorusGeometry(0.154, 0.013, 8, 20);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xFFBB00, emissive: 0x886600, emissiveIntensity: 0.3 });
  const rim    = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const BASE_Y = 0.55;
  group.position.set(x, BASE_Y, z);
  group.rotation.z = Math.PI / 2;
  scene.add(group);

  return { mesh: group, baseY: BASE_Y };
}

// ── Public: spawn all coins on game/mode start ───────────────────────────────
export function spawnWorldItems(scene) {
  for (const item of worldItems) scene.remove(item.mesh);
  worldItems.length = 0;

  if (!hardMode) return;

  const positions = stratifiedCoinPositions();
  for (const { x, z } of positions) {
    const { mesh, baseY } = buildCoinMesh(scene, x, z);
    worldItems.push({
      mesh, itemId: 'coin', baseY, collected: false,
      x, z, rotOffset: Math.random() * Math.PI * 2, respawnTimer: 0, scene,
    });
  }
}

// ── Public: animate + pickup + respawn ───────────────────────────────────────
export function updateWorldItems(scene, playerX, playerZ, delta, gameStarted) {
  const t = performance.now() / 1000;

  for (const item of worldItems) {
    // ── Respawn countdown ─────────────────────────────────────────────────
    if (item.collected) {
      item.respawnTimer -= delta;
      if (item.respawnTimer <= 0) {
        // Pick a new position away from all active coins
        const active = worldItems.filter(c => !c.collected && c !== item);
        const { x, z } = randomCoinPos(active);
        item.x = x;
        item.z = z;
        item.rotOffset = Math.random() * Math.PI * 2;
        item.collected = false;
        item.mesh.position.set(x, item.baseY, z);
        scene.add(item.mesh);
      }
      continue;
    }

    // ── Bob + spin ────────────────────────────────────────────────────────
    item.mesh.position.y = item.baseY + Math.sin(t * 2.2 + item.rotOffset) * 0.08;
    item.mesh.rotation.y = t * 2.5 + item.rotOffset;

    // ── Pickup ────────────────────────────────────────────────────────────
    if (!gameStarted) continue;
    const dx = playerX - item.x;
    const dz = playerZ - item.z;
    if (dx * dx + dz * dz < PICKUP_DIST_SQ) {
      const added = addToInventory(item.itemId);
      if (added) {
        item.collected    = true;
        item.respawnTimer = RESPAWN_DELAY;
        scene.remove(item.mesh);
      }
    }
  }
}

// ── Public: spawn a pile of loose coins at a position (trip spill) ──────────
export function spawnTripCoins(scene, cx, cz, count) {
  for (let i = 0; i < count; i++) {
    // Scatter in a 1.2–4.5 unit radius ring so coins spread visibly around the player
    const angle   = (i / count) * Math.PI * 2 + Math.random() * 1.2;
    // Radius scales with coin count: 1 coin → 1.2–3.0, 10 coins → 2.2–7.5
    const rMin  = 1.2 + count * 0.1;
    const rMax  = 3.0 + count * 0.45;
    const r     = rMin + Math.random() * (rMax - rMin);
    const x     = cx + Math.cos(angle) * r;
    const z     = cz + Math.sin(angle) * r;
    const { mesh, baseY } = buildCoinMesh(scene, x, z);
    worldItems.push({
      mesh, itemId: 'coin', baseY, collected: false,
      x, z, rotOffset: Math.random() * Math.PI * 2,
      respawnTimer: 0, scene,
      isTripCoin: true,   // flag so we can clean these up eventually
    });
  }
}

// ── Public: full reset (re-scatter all coins) ────────────────────────────────
export function resetWorldItems(scene) {
  for (const item of worldItems) scene.remove(item.mesh);
  worldItems.length = 0;

  if (!hardMode) return;

  const positions = stratifiedCoinPositions();
  for (const { x, z } of positions) {
    const { mesh, baseY } = buildCoinMesh(scene, x, z);
    worldItems.push({
      mesh, itemId: 'coin', baseY, collected: false,
      x, z, rotOffset: Math.random() * Math.PI * 2, respawnTimer: 0, scene,
    });
  }
}

