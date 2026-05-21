import * as THREE from 'three';

const DOOR_TARGET = { x: 3.5, z: -7.5 };
const PASSENGER_RADIUS = 0.38;
const BOARD_TIME = 1.5; // seconds to board once at the door

const SKIN_COLORS = [0xffd5b0, 0xc68642, 0x8d5524, 0xf1c27d, 0xffe0bd];
const HAT_COLORS  = [0xe63946, 0x457b9d, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x6a0572, 0x1d3557];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makePassengerMesh() {
  const group = new THREE.Group();

  const skinColor = randomFrom(SKIN_COLORS);
  const hatColor  = randomFrom(HAT_COLORS);

  // Body — tall capsule-ish: cylinder + two half-spheres
  const bodyMat = new THREE.MeshLambertMaterial({ color: hatColor }); // clothing color
  const cylGeo  = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10);
  const cyl     = new THREE.Mesh(cylGeo, bodyMat);
  cyl.position.y = 0.7;
  group.add(cyl);

  // Bottom dome
  const botGeo = new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const bot    = new THREE.Mesh(botGeo, bodyMat);
  bot.position.y = 0.25;
  group.add(bot);

  // Top dome (shoulders)
  const topGeo = new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const top    = new THREE.Mesh(topGeo, bodyMat);
  top.position.y = 1.15;
  group.add(top);

  // Head — sphere, skin color
  const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const headGeo = new THREE.SphereGeometry(0.22, 10, 10);
  const head    = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.52;
  group.add(head);

  // Little hat blob on top of head
  const hatGeo = new THREE.SphereGeometry(0.14, 8, 8);
  const hatMat = new THREE.MeshLambertMaterial({ color: hatColor });
  const hat    = new THREE.Mesh(hatGeo, hatMat);
  hat.scale.y = 1.4;
  hat.position.y = 1.78;
  group.add(hat);

  group.castShadow = true;
  return group;
}

function randomIdleTarget(baseX, baseZ) {
  return {
    x: baseX + (Math.random() - 0.5) * 3.5,
    z: baseZ + (Math.random() - 0.5) * 2.0,
  };
}

export function createPassengers(scene, count = 4) {
  const passengers = [];

  for (let i = 0; i < count; i++) {
    const mesh = makePassengerMesh();

    const startX = -3 + (Math.random() - 0.5) * 6;
    const startZ = -12 + (Math.random() - 0.5) * 2;

    mesh.position.set(startX, 0, startZ);
    scene.add(mesh);

    const idleTarget = randomIdleTarget(startX, startZ);

    passengers.push({
      mesh,
      startX,
      startZ,
      x: startX,
      z: startZ,
      speed: 1.8 + Math.random() * 2.4,
      rushing: false,
      boarded: false,
      boardingTimer: 0,
      idleTarget,
      idleTimer: 1.5 + Math.random() * 2.5, // seconds until next wander target
    });
  }

  return passengers;
}

export function resetPassengers(passengers) {
  passengers.forEach(p => {
    p.startX = -3 + (Math.random() - 0.5) * 6;
    p.startZ  = -12 + (Math.random() - 0.5) * 2;
    p.x = p.startX;
    p.z = p.startZ;
    p.speed = 1.8 + Math.random() * 2.4;
    p.rushing = false;
    p.boarded = false;
    p.boardingTimer = 0;
    p.idleTarget = randomIdleTarget(p.startX, p.startZ);
    p.idleTimer = 1.5 + Math.random() * 2.5;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.visible = true;
  });
}

export function updatePassengers(passengers, delta, playerPos) {
  const DOOR_X = DOOR_TARGET.x;
  const DOOR_Z = DOOR_TARGET.z;

  // Collect all agent positions for collision (passengers + player)
  const agents = passengers
    .filter(p => !p.boarded)
    .map(p => ({ x: p.x, z: p.z, isPlayer: false, ref: p }));
  agents.push({ x: playerPos.x, z: playerPos.z, isPlayer: true });

  const IDLE_SPEED = 0.6;

  for (const p of passengers) {
    if (p.boarded) continue;

    if (!p.rushing) {
      // Idle wander: count down timer, then pick new target
      p.idleTimer -= delta;
      if (p.idleTimer <= 0) {
        p.idleTarget = randomIdleTarget(p.startX, p.startZ);
        p.idleTimer = 1.5 + Math.random() * 3.0;
      }

      // Drift toward idle target
      const idx = p.idleTarget.x - p.x;
      const idz = p.idleTarget.z - p.z;
      const idist = Math.sqrt(idx * idx + idz * idz);
      if (idist > 0.15) {
        p.x += (idx / idist) * IDLE_SPEED * delta;
        p.z += (idz / idist) * IDLE_SPEED * delta;
      }
      continue;
    }

    // Rushing — move toward door
    const dx = DOOR_X - p.x;
    const dz = DOOR_Z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.5) {
      // At the door — count boarding time, but only if door isn't busy with another passenger
      const doorBusy = passengers.some(other => other !== p && !other.boarded && other.boardingTimer > 0);
      if (!doorBusy) {
        p.boardingTimer += delta;
        if (p.boardingTimer >= BOARD_TIME) {
          p.boarded = true;
          p.mesh.visible = false;
        }
      }
      // Stand still while waiting/boarding
      continue;
    }

    // Reset boarding timer if pushed away from door
    p.boardingTimer = 0;

    const nx = dx / dist;
    const nz = dz / dist;

    p.x += nx * p.speed * delta;
    p.z += nz * p.speed * delta;
  }

  // Separation: push overlapping agents apart (passengers vs player only, not passenger vs passenger)
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i];
      const b = agents[j];
      // Skip passenger-passenger pairs
      if (!a.isPlayer && !b.isPlayer) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      const minDist = PASSENGER_RADIUS * 2;

      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const nz = dz / dist;

        // Push both apart (skip player — player is controlled by input)
        if (!a.isPlayer && a.ref) {
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          a.ref.x = a.x;
          a.ref.z = a.z;
        }
        if (!b.isPlayer && b.ref) {
          b.x += nx * overlap;
          b.z += nz * overlap;
          b.ref.x = b.x;
          b.ref.z = b.z;
        }
      }
    }
  }

  // Sync mesh positions + face direction of travel
  for (const p of passengers) {
    if (p.boarded) continue;
    p.mesh.position.set(p.x, 0, p.z);

    if (p.rushing) {
      const dx = DOOR_X - p.x;
      const dz = DOOR_Z - p.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) {
        p.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      const dx = p.idleTarget.x - p.x;
      const dz = p.idleTarget.z - p.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.15) {
        p.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  return false;
}

