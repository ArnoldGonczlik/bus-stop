import * as THREE from 'three';
import dialogueEn from './dialogue_en.json';
import dialogueNo from './dialogue_no.json';

const DOOR_TARGET = { x: 3.5, z: -7.5 };
const PASSENGER_RADIUS = 0.38;
const BOARD_TIME = 1.2;
const QUEUE_SPACING = 0.85;

export const KIOSK_DOOR_X = 7;
export const KIOSK_DOOR_Z = -18;

const BUS_CLOSE_THRESHOLD = -20;

// Static obstacle boxes (world space, no player radius expansion — passengers are narrower)
const PAX_RADIUS = PASSENGER_RADIUS;
const OBSTACLE_BOXES = [
  { minX: 4.5,  maxX: 9.5,  minZ: -21.75, maxZ: -18.25 }, // kiosk body
  { minX: -1.75, maxX: 1.75, minZ: -13.45, maxZ: -13.15 }, // shelter back wall
];

function clampToObstacles(x, z, prevX, prevZ) {
  for (const b of OBSTACLE_BOXES) {
    const inside = x > b.minX - PAX_RADIUS && x < b.maxX + PAX_RADIUS &&
                   z > b.minZ - PAX_RADIUS && z < b.maxZ + PAX_RADIUS;
    if (inside) return { x: prevX, z: prevZ };
  }
  return { x, z };
}

const SKIN_COLORS = [0xffd5b0, 0xc68642, 0x8d5524, 0xf1c27d, 0xffe0bd];
const CLOTHING_COLORS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x6a0572, 0x1d3557];
const MOODS_DAY   = ['happy', 'neutral', 'neutral', 'angry', 'angry', 'erratic'];
const MOODS_NIGHT = ['neutral', 'angry', 'erratic', 'erratic', 'erratic'];
let nightMode = false;
export function setNightMode(n) { nightMode = n; }
function pickMood() { return randomFrom(nightMode ? MOODS_NIGHT : MOODS_DAY); }

const MOOD_BORDER = { happy: '#e8a900', neutral: '#777e8a', angry: '#c1121f', erratic: '#9b5de5' };
const MOOD_TEXT   = { happy: '#1a472a', neutral: '#1a1a2e', angry: '#7d0000', erratic: '#4a0080' };

const DIALOGUES = { en: dialogueEn, no: dialogueNo };
let currentLang = 'no';

export function setLanguage(lang) {
  if (DIALOGUES[lang]) currentLang = lang;
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
const BUBBLE_W = 512;
const BUBBLE_H = 170;
const BUBBLE_TAIL = 26;
const BUBBLE_CANVAS_H = BUBBLE_H + BUBBLE_TAIL;
const PLANE_W = 1.26;
const PLANE_H = PLANE_W * (BUBBLE_CANVAS_H / BUBBLE_W);

function drawBubble(ctx, text, mood) {
  const W = BUBBLE_W, H = BUBBLE_CANVAS_H;
  const bH = BUBBLE_H;
  const r = 20;

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

  bubblePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.92)';
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();

  bubblePath();
  ctx.strokeStyle = MOOD_BORDER[mood];
  ctx.lineWidth = 5;
  ctx.stroke();

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

  // Black outline stroke for readability over any background
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
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_W, PLANE_H), mat);
  mesh.visible = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, ctx, texture };
}

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
    return {
      startX: -2 + (Math.random() - 0.5) * 5,
      startZ: -12.5 + (Math.random() - 0.5) * 1.5,
    };
  } else {
    return {
      startX: 3.5 + (Math.random() - 0.5) * 4,
      startZ: -17 + (Math.random() - 0.5) * 2.5,
    };
  }
}

const MIN_SPAWN_DIST = 1.2;

// Spawn area: pavement in front of the kiosk, well clear of the kiosk body (x<4.5)
function findSpawnPos(existing, wantsBus) {
  for (let attempt = 0; attempt < 60; attempt++) {
    let x, z;
    if (wantsBus) {
      // Near bus shelter, clear of kiosk
      x = -3 + (Math.random() - 0.5) * 6;
      z = -13 + (Math.random() - 0.5) * 3;
    } else {
      // Café side — keep x < 4.0 to stay outside kiosk AABB (minX 4.5)
      x = 1.5 + (Math.random() - 0.5) * 4;
      z = -16.5 + (Math.random() - 0.5) * 3;
    }
    // Reject if inside any obstacle
    let blocked = false;
    for (const b of OBSTACLE_BOXES) {
      if (x > b.minX - PAX_RADIUS && x < b.maxX + PAX_RADIUS &&
          z > b.minZ - PAX_RADIUS && z < b.maxZ + PAX_RADIUS) {
        blocked = true; break;
      }
    }
    if (blocked) continue;
    // Reject if too close to another passenger
    let tooClose = false;
    for (const p of existing) {
      const dx = p.x - x, dz = p.z - z;
      if (dx*dx + dz*dz < MIN_SPAWN_DIST * MIN_SPAWN_DIST) { tooClose = true; break; }
    }
    if (!tooClose) return { x, z };
  }
  // Fallback — scatter on clear pavement
  return { x: -4 + Math.random() * 3, z: -11 + Math.random() * 2 };
}

function makePax(scene, index, existing = []) {
  const mood     = pickMood();
  const hasHat   = Math.random() < 0.5;
  const wantsBus = Math.random() < 0.35;
  const { group: mesh, hat: hatMesh } = makePassengerMesh(hasHat);

  const { x: spawnX, z: spawnZ } = findSpawnPos(existing, wantsBus);

  const { startX, startZ } = wanderBase(wantsBus);

  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  const bubble = makeBubble(scene);

  return {
    mesh, hatMesh, bubble,
    mood, hasHat, wantsBus,
    chatState: 'idle',
    chatTimer: (wantsBus ? 10 : 18) + index * 5 + Math.random() * 8,
    bubbleHideTimer: 0,
    startX, startZ,
    x: spawnX, z: spawnZ,
    prevX: spawnX, prevZ: spawnZ,
    speed: 1.8 + Math.random() * 2.4,
    erraticSpeedMult: 1,
    erraticSpeedTimer: 0,
    rushing: false,
    boarded: false,
    boardingTimer: 0,
    queueIndex: -1,
    idleTarget: { x: startX, z: startZ },
    idleTimer: 1.5 + Math.random() * 2.5,
    unstickCooldown: 0,
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

    const { x: spawnX, z: spawnZ } = findSpawnPos(placed, p.wantsBus);
    placed.push({ x: spawnX, z: spawnZ });
    const base = wanderBase(p.wantsBus);
    p.startX = base.startX;
    p.startZ  = base.startZ;
    p.x = spawnX;
    p.z = spawnZ;
    p.prevX = spawnX;
    p.prevZ = spawnZ;

    p.speed = 1.8 + Math.random() * 2.4;
    p.erraticSpeedMult = 1;
    p.erraticSpeedTimer = 0;
    p.rushing = false;
    p.boarded = false;
    p.boardingTimer = 0;
    p.queueIndex = -1;
    p.idleTarget = { x: p.startX, z: p.startZ };
    p.idleTimer = 1.5 + Math.random() * 2.5;
    p.unstickCooldown = 0;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.visible = true;
    p.bubble.mesh.visible = false;
  });
}

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

  const IDLE_SPEED = 0.6;

  for (const p of passengers) {
    if (p.boarded) continue;

    // Store position before movement for obstacle rollback
    p.prevX = p.x;
    p.prevZ = p.z;

    // --- Chat state machine ---
    const targetChatState = p.rushing ? 'boarding' : (busClose ? 'arriving' : 'idle');
    if (targetChatState !== p.chatState) {
      p.chatState = targetChatState;
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
        p.chatTimer = 30 + Math.random() * 20;
      }
    }

    if (p.unstickCooldown > 0) p.unstickCooldown -= delta;

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
        const nx = p.x + (idx / idist) * moveSpeed * delta;
        const nz = p.z + (idz / idist) * moveSpeed * delta;
        const clamped = clampToObstacles(nx, nz, p.x, p.z);
        p.x = clamped.x;
        p.z = clamped.z;
      }
      continue;
    }

    // Rushing to queue slot
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

    if (dist < 0.12) continue;

    p.boardingTimer = 0;
    p.x += (dx / dist) * p.speed * delta;
    p.z += (dz / dist) * p.speed * delta;
  }

  // --- Single-pass separation (no multi-iter to prevent vibration) ---
  const active = passengers.filter(p => !p.boarded);
  const minDist = PASSENGER_RADIUS * 2;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDistSq) continue;

      let nx, nz;
      if (distSq < 0.0001) {
        const angle = (i * 2.39996) % (Math.PI * 2);
        nx = Math.cos(angle); nz = Math.sin(angle);
      } else {
        const d = Math.sqrt(distSq);
        nx = dx / d; nz = dz / d;
      }

      const actualDist = distSq < 0.0001 ? 0 : Math.sqrt(distSq);
      // Half overlap each, clamped to avoid overshooting
      const push = Math.min((minDist - actualDist) * 0.5, 0.06);

      // Both rushing: push only along the axis perpendicular to the queue column (X axis)
      // so they spread left/right without fighting the Z queue order
      if (a.rushing && b.rushing) {
        a.x -= nx * push;
        b.x += nx * push;
      } else if (a.rushing) {
        // a is stiff, push b only
        b.x += nx * push * 2;
        b.z += nz * push * 2;
      } else if (b.rushing) {
        // b is stiff, push a only
        a.x -= nx * push * 2;
        a.z -= nz * push * 2;
      } else {
        // Both idle — split evenly
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }

      // Clamp moved passengers back out of obstacles
      if (!a.rushing) {
        const ca = clampToObstacles(a.x, a.z, a.prevX, a.prevZ);
        a.x = ca.x; a.z = ca.z;
      }
      if (!b.rushing) {
        const cb = clampToObstacles(b.x, b.z, b.prevX, b.prevZ);
        b.x = cb.x; b.z = cb.z;
      }
    }
  }

  // Passenger–player separation: push passengers away from player (player is immovable)
  for (const p of active) {
    const dx = p.x - playerPos.x;
    const dz = p.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    const minPD = PASSENGER_RADIUS + 0.35;
    if (distSq < minPD * minPD && distSq > 0.0001) {
      const d = Math.sqrt(distSq);
      const push = (minPD - d) * 0.8;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      if (!p.rushing) {
        const c = clampToObstacles(p.x, p.z, p.prevX, p.prevZ);
        p.x = c.x; p.z = c.z;
      }
    }
  }

  // Unstick idle passengers — only redirect if still stuck AND cooldown expired
  for (const p of passengers) {
    if (p.boarded || p.rushing || p.unstickCooldown > 0) continue;
    for (const q of passengers) {
      if (q === p || q.boarded) continue;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx*dx + dz*dz < (PASSENGER_RADIUS * 2.0) ** 2) {
        p.idleTarget = randomIdleTarget(p.startX, p.startZ);
        p.idleTimer = 0.8 + Math.random() * 1.0;
        p.unstickCooldown = 1.5; // don't redirect again for 1.5 s
        break;
      }
    }
  }

  // Sync mesh positions, facing, bubble billboarding
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
