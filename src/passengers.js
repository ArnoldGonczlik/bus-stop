import * as THREE from 'three';
import dialogueEn from './dialogue_en.json';
import dialogueNo from './dialogue_no.json';

const DOOR_TARGET = { x: 3.5, z: -7.5 };
const PASSENGER_RADIUS = 0.38;
const BOARD_TIME = 1.2;
const QUEUE_SPACING = 0.85;

// Kiosk door — passengers spawn here and walk toward the stop
export const KIOSK_DOOR_X = 7;
export const KIOSK_DOOR_Z = -18;

// Bus must be within this X of the stop before passengers react
const BUS_CLOSE_THRESHOLD = -20;

const SKIN_COLORS = [0xffd5b0, 0xc68642, 0x8d5524, 0xf1c27d, 0xffe0bd];
const CLOTHING_COLORS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x6a0572, 0x1d3557];
const MOODS_DAY   = ['happy', 'neutral', 'neutral', 'angry', 'angry', 'erratic'];
const MOODS_NIGHT = ['neutral', 'angry', 'erratic', 'erratic', 'erratic']; // darker, more erratic
let nightMode = false;
export function setNightMode(n) { nightMode = n; }
function pickMood() { return randomFrom(nightMode ? MOODS_NIGHT : MOODS_DAY); }

const MOOD_BORDER = { happy: '#e8a900', neutral: '#777e8a', angry: '#c1121f', erratic: '#9b5de5' };
const MOOD_TEXT   = { happy: '#1a472a', neutral: '#1a1a2e', angry: '#7d0000', erratic: '#4a0080' };

// ---- Language system ----
const DIALOGUES = { en: dialogueEn, no: dialogueNo };
let currentLang = 'no'; // default Norwegian

export function setLanguage(lang) {
  if (DIALOGUES[lang]) currentLang = lang;
  // silently ignore unsupported lang codes
}
export function getCurrentLang() { return currentLang; }
function getPool(wantsBus) {
  const d = DIALOGUES[currentLang];
  return wantsBus ? d.bus : d.cafe;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Chat bubble ---
// High-res canvas: 512 px wide so text is crisp at close range
const BUBBLE_W = 512;
const BUBBLE_H = 170;
const BUBBLE_TAIL = 26;
const BUBBLE_CANVAS_H = BUBBLE_H + BUBBLE_TAIL; // 196
const PLANE_W = 2.1;
const PLANE_H = PLANE_W * (BUBBLE_CANVAS_H / BUBBLE_W); // ≈ 0.803

function drawBubble(ctx, text, mood) {
  const W = BUBBLE_W, H = BUBBLE_CANVAS_H;
  const bH = BUBBLE_H;
  const r = 20; // corner radius (scaled up for 512-wide canvas)

  ctx.clearRect(0, 0, W, H);

  function bubblePath() {
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(W - r, 0);
    ctx.arcTo(W, 0, W, r, r);
    ctx.lineTo(W, bH - r);
    ctx.arcTo(W, bH, W - r, bH, r);
    ctx.lineTo(W / 2 + BUBBLE_TAIL, bH);
    ctx.lineTo(W / 2, H);
    ctx.lineTo(W / 2 - BUBBLE_TAIL, bH);
    ctx.lineTo(r, bH);
    ctx.arcTo(0, bH, 0, bH - r, r);
    ctx.lineTo(0, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
  }

  // Black outer stroke
  bubblePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.92)';
  ctx.lineWidth = 10;
  ctx.stroke();

  // White fill
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();

  // Mood colour inner stroke
  bubblePath();
  ctx.strokeStyle = MOOD_BORDER[mood];
  ctx.lineWidth = 5;
  ctx.stroke();

  // Word-wrapped text with stroke outline for readability over any background
  const maxTW = W - 60;
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxTW) { cur = test; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);

  const lineH = 36;
  const startY = bH / 2 - (lines.length * lineH) / 2 + lineH / 2;

  // Black outline stroke
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 4;
  for (let i = 0; i < lines.length; i++) {
    ctx.strokeText(lines[i], W / 2, startY + i * lineH);
  }
  // Mood-coloured text fill
  ctx.fillStyle = MOOD_TEXT[mood];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, startY + i * lineH);
  }
}

function makeBubble(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = BUBBLE_W;
  canvas.height = BUBBLE_CANVAS_H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter; // no mipmap blur on text
  texture.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,   // render over all 3D geometry
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_W, PLANE_H), mat);
  mesh.visible = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, ctx, texture };
}

// --- Passenger mesh ---
function makePassengerMesh(hasHat) {
  const group = new THREE.Group();
  const skinColor = randomFrom(SKIN_COLORS);
  const clothingColor = randomFrom(CLOTHING_COLORS);
  const bodyMat = new THREE.MeshLambertMaterial({ color: clothingColor });

  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), bodyMat);
  cyl.position.y = 0.7;
  group.add(cyl);

  const bot = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    bodyMat
  );
  bot.position.y = 0.25;
  group.add(bot);

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    bodyMat
  );
  top.position.y = 1.15;
  group.add(top);

  const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), headMat);
  head.position.y = 1.52;
  group.add(head);

  const hatMat = new THREE.MeshLambertMaterial({ color: clothingColor });
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), hatMat);
  hat.scale.y = 1.4;
  hat.position.y = 1.78;
  hat.visible = hasHat;
  group.add(hat);

  group.castShadow = true;
  return { group, hat };
}

function randomIdleTarget(baseX, baseZ) {
  return {
    x: baseX + (Math.random() - 0.5) * 3.5,
    z: baseZ + (Math.random() - 0.5) * 2.0,
  };
}

function randomErraticTarget(baseX, baseZ) {
  return {
    x: baseX + (Math.random() - 0.5) * 18,
    z: baseZ + (Math.random() - 0.5) * 9,
  };
}

function wanderBase(wantsBus) {
  if (wantsBus) {
    // Idle near the bus shelter
    return {
      startX: -2 + (Math.random() - 0.5) * 5,
      startZ: -12.5 + (Math.random() - 0.5) * 1.5,
    };
  } else {
    // Idle near the kiosk / outdoor seating
    return {
      startX: 3.5 + (Math.random() - 0.5) * 4,
      startZ: -17 + (Math.random() - 0.5) * 2.5,
    };
  }
}

const MIN_SPAWN_DIST = 1.0;

function findSpawnPos(existing) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = KIOSK_DOOR_X + (Math.random() - 0.5) * 5;
    const z = KIOSK_DOOR_Z + (Math.random() - 0.5) * 4;
    let ok = true;
    for (const p of existing) {
      const dx = p.x - x, dz = p.z - z;
      if (dx*dx + dz*dz < MIN_SPAWN_DIST * MIN_SPAWN_DIST) { ok = false; break; }
    }
    if (ok) return { x, z };
  }
  return { x: KIOSK_DOOR_X + (Math.random() - 0.5) * 8, z: KIOSK_DOOR_Z + (Math.random() - 0.5) * 6 };
}

function makePax(scene, index, existing = []) {
  const mood     = pickMood();
  const hasHat   = Math.random() < 0.5;
  const wantsBus = Math.random() < 0.35; // ~35% take the bus, rest stay at café
  const { group: mesh, hat: hatMesh } = makePassengerMesh(hasHat);

  const { x: spawnX, z: spawnZ } = findSpawnPos(existing);

  const { startX, startZ } = wanderBase(wantsBus);

  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  const bubble = makeBubble(scene);

  return {
    mesh, hatMesh, bubble,
    mood, hasHat, wantsBus,
    chatState: 'idle',
    // Café people talk more rarely — stagger start more too
    chatTimer: (wantsBus ? 10 : 18) + index * 5 + Math.random() * 8,
    bubbleHideTimer: 0,
    startX, startZ,
    x: spawnX, z: spawnZ,
    speed: 1.8 + Math.random() * 2.4,
    erraticSpeedMult: 1,
    erraticSpeedTimer: 0,
    rushing: false,
    boarded: false,
    boardingTimer: 0,
    queueIndex: -1,
    idleTarget: { x: startX, z: startZ },
    idleTimer: 1.5 + Math.random() * 2.5,
  };
}

export function createPassengers(scene, count) {
  const passengers = [];
  for (let i = 0; i < count; i++) {
    passengers.push(makePax(scene, i, passengers));
  }
  return passengers;
}

export function resetPassengers(passengers) {
  const placed = [];
  passengers.forEach((p, i) => {
    p.mood     = pickMood();
    p.hasHat   = Math.random() < 0.5;
    p.wantsBus = Math.random() < 0.35;
    p.hatMesh.visible = p.hasHat;
    p.chatState = 'idle';
    p.chatTimer = (p.wantsBus ? 10 : 18) + i * 5 + Math.random() * 8;
    p.bubbleHideTimer = 0;

    const { x: spawnX, z: spawnZ } = findSpawnPos(placed);
    placed.push({ x: spawnX, z: spawnZ });
    const base = wanderBase(p.wantsBus);
    p.startX = base.startX;
    p.startZ  = base.startZ;
    p.x = spawnX;
    p.z = spawnZ;

    p.speed = 1.8 + Math.random() * 2.4;
    p.erraticSpeedMult = 1;
    p.erraticSpeedTimer = 0;
    p.rushing = false;
    p.boarded = false;
    p.boardingTimer = 0;
    p.queueIndex = -1;
    p.idleTarget = { x: p.startX, z: p.startZ };
    p.idleTimer = 1.5 + Math.random() * 2.5;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.visible = true;
    p.bubble.mesh.visible = false;
  });
}

// busState: { arriving: bool, busCurrentX: number }
export function updatePassengers(passengers, delta, playerPos, camera, busState) {
  const DOOR_X = DOOR_TARGET.x;
  const DOOR_Z = DOOR_TARGET.z;

  const busClose = busState && busState.arriving &&
    typeof busState.busCurrentX === 'number' &&
    busState.busCurrentX > BUS_CLOSE_THRESHOLD;

  // Assign queue slots
  const usedSlots = new Set(
    passengers
      .filter(p => !p.boarded && p.rushing && p.queueIndex >= 0)
      .map(p => p.queueIndex)
  );
  for (const p of passengers) {
    if (!p.boarded && p.rushing && p.queueIndex < 0) {
      let slot = 0;
      while (usedSlots.has(slot)) slot++;
      p.queueIndex = slot;
      usedSlots.add(slot);
    }
  }

  // Shift queue when front boards
  const frontPassenger = passengers.find(p => p.boarded && p.queueIndex === 0);
  if (frontPassenger) {
    frontPassenger.queueIndex = -2;
    for (const other of passengers) {
      if (!other.boarded && other.rushing && other.queueIndex > 0) {
        other.queueIndex--;
      }
    }
  }

  const agents = passengers
    .filter(p => !p.boarded)
    .map(p => ({ x: p.x, z: p.z, isPlayer: false, ref: p }));
  agents.push({ x: playerPos.x, z: playerPos.z, isPlayer: true });

  const IDLE_SPEED = 0.6;

  for (const p of passengers) {
    if (p.boarded) continue;

    // --- Chat state machine ---
    const targetChatState = p.rushing ? 'boarding' : (busClose ? 'arriving' : 'idle');
    if (targetChatState !== p.chatState) {
      p.chatState = targetChatState;
      // Stagger so passengers don't all speak at the same moment
      p.chatTimer = 2 + Math.random() * 8;
      p.bubbleHideTimer = 0;
      p.bubble.mesh.visible = false;
    }

    if (p.bubble.mesh.visible && p.bubbleHideTimer > 0) {
      p.bubbleHideTimer -= delta;
      if (p.bubbleHideTimer <= 0) p.bubble.mesh.visible = false;
    }

    p.chatTimer -= delta;
    if (p.chatTimer <= 0) {
      const pool = getPool(p.wantsBus);
      const line = randomFrom(pool[p.mood][p.chatState]);
      drawBubble(p.bubble.ctx, line, p.mood);
      p.bubble.texture.needsUpdate = true;
      p.bubble.mesh.visible = true;
      p.bubbleHideTimer = 5 + Math.random() * 3;
      if (p.wantsBus) {
        p.chatTimer = p.chatState === 'idle' ? 22 + Math.random() * 14 : 8 + Math.random() * 7;
      } else {
        // Café people speak much less
        p.chatTimer = 30 + Math.random() * 20;
      }
    }

    // --- Movement ---
    if (!p.rushing) {
      p.idleTimer -= delta;

      if (p.mood === 'erratic') {
        if (p.idleTimer <= 0) {
          p.idleTarget = randomErraticTarget(p.startX, p.startZ);
          p.idleTimer = 0.4 + Math.random() * 1.2;
        }
        p.erraticSpeedTimer -= delta;
        if (p.erraticSpeedTimer <= 0) {
          p.erraticSpeedMult = 0.15 + Math.random() * 2.8;
          p.erraticSpeedTimer = 0.3 + Math.random() * 1.5;
        }
      } else {
        if (p.idleTimer <= 0) {
          p.idleTarget = randomIdleTarget(p.startX, p.startZ);
          p.idleTimer = 1.5 + Math.random() * 3.0;
        }
      }

      const moveSpeed = p.mood === 'erratic' ? p.erraticSpeedMult : IDLE_SPEED;
      const idx = p.idleTarget.x - p.x;
      const idz = p.idleTarget.z - p.z;
      const idist = Math.sqrt(idx * idx + idz * idz);
      if (idist > 0.15) {
        p.x += (idx / idist) * moveSpeed * delta;
        p.z += (idz / idist) * moveSpeed * delta;
      }
      continue;
    }

    // Rushing to queue
    const slotTargetX = DOOR_X;
    const slotTargetZ = DOOR_Z - p.queueIndex * QUEUE_SPACING;
    const dx = slotTargetX - p.x;
    const dz = slotTargetZ - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (p.queueIndex === 0 && dist < 0.5) {
      p.boardingTimer += delta;
      if (p.boardingTimer >= BOARD_TIME) {
        p.boarded = true;
        p.mesh.visible = false;
        p.bubble.mesh.visible = false;
      }
      continue;
    }

    if (dist < 0.18) continue;

    p.boardingTimer = 0;
    p.x += (dx / dist) * p.speed * delta;
    p.z += (dz / dist) * p.speed * delta;
  }

  // Separation: run multiple iterations so overlapping chains fully resolve
  const SEP_ITERS = 3;
  const minDist = PASSENGER_RADIUS * 2;
  for (let iter = 0; iter < SEP_ITERS; iter++) {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          let nx, nz;
          if (distSq < 0.0001) {
            // Exactly on top — give a deterministic nudge so they don't lock
            const angle = (i * 2.39996) % (Math.PI * 2); // golden-angle spread
            nx = Math.cos(angle); nz = Math.sin(angle);
          } else {
            const dist = Math.sqrt(distSq);
            nx = dx / dist; nz = dz / dist;
          }
          const dist2 = Math.sqrt(distSq < 0.0001 ? 0 : distSq);
          const overlap = (minDist - (distSq < 0.0001 ? 0 : dist2)) / 2;

          // Player is immovable; non-rushing passengers split equally; rushing ones
          // are pushed sideways (Z only) to preserve queue column
          if (!a.isPlayer && a.ref) {
            if (a.ref.rushing) { a.z -= nz * overlap; a.ref.z = a.z; }
            else { a.x -= nx * overlap; a.z -= nz * overlap; a.ref.x = a.x; a.ref.z = a.z; }
          }
          if (!b.isPlayer && b.ref) {
            if (b.ref.rushing) { b.z += nz * overlap; b.ref.z = b.z; }
            else { b.x += nx * overlap; b.z += nz * overlap; b.ref.x = b.x; b.ref.z = b.z; }
          }
        }
      }
    }
  }

  // Unstick idle passengers that haven't been able to move toward their target:
  // if an idle pax is still overlapping another after separation, redirect to a fresh target
  for (const p of passengers) {
    if (p.boarded || p.rushing) continue;
    for (const q of passengers) {
      if (q === p || q.boarded) continue;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx*dx + dz*dz < (PASSENGER_RADIUS * 2.2) ** 2) {
        // Pick a new idle target that steers away
        p.idleTarget = randomIdleTarget(p.startX, p.startZ);
        p.idleTimer = 0.2;
        break;
      }
    }
  }

  // Sync mesh positions, facing, and bubble billboarding
  for (const p of passengers) {
    if (p.boarded) continue;
    p.mesh.position.set(p.x, 0, p.z);

    if (p.rushing) {
      const slotTargetZ = DOOR_Z - p.queueIndex * QUEUE_SPACING;
      const dx = DOOR_X - p.x;
      const dz = slotTargetZ - p.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) p.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      const dx = p.idleTarget.x - p.x;
      const dz = p.idleTarget.z - p.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.15) p.mesh.rotation.y = Math.atan2(dx, dz);
    }

    if (p.bubble.mesh.visible && camera) {
      p.bubble.mesh.position.set(p.x, 2.2, p.z);
      p.bubble.mesh.quaternion.copy(camera.quaternion);
    }
  }

  return false;
}

// Force a passenger to say a new line immediately (player-triggered interaction)
export function forcePassengerChat(p) {
  if (p.boarded) return;
  const pool = getPool(p.wantsBus);
  const line = randomFrom(pool[p.mood][p.chatState]);
  drawBubble(p.bubble.ctx, line, p.mood);
  p.bubble.texture.needsUpdate = true;
  p.bubble.mesh.visible = true;
  p.bubbleHideTimer = 6;
  p.chatTimer = 10 + Math.random() * 8;
}
