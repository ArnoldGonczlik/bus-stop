import * as THREE from 'three';

// Seagull state kept module-level so updateScene() can animate them
const seagulls = [];
let seagullSpawnTimer = 0;
let isNightMode = false; // set by createScene

function spawnSeagull(scene) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });

  // Simple M-shaped seagull: two flat boxes as wings
  const wingGeo = new THREE.BoxGeometry(1.4, 0.07, 0.28);
  const leftWing = new THREE.Mesh(wingGeo, mat);
  leftWing.position.set(-0.7, 0, 0);
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, mat);
  rightWing.position.set(0.7, 0, 0);
  group.add(rightWing);

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.18, 0.12, 0.55);
  const body = new THREE.Mesh(bodyGeo, mat);
  group.add(body);

  // Random start position anywhere around the map edges
  const side = Math.floor(Math.random() * 4);
  let startX, startZ;
  if (side === 0) { startX = -55; startZ = -40 + Math.random() * 60; }       // from left
  else if (side === 1) { startX = 55; startZ = -40 + Math.random() * 60; }   // from right
  else if (side === 2) { startX = -40 + Math.random() * 80; startZ = -55; }  // from front
  else             { startX = -40 + Math.random() * 80; startZ = 55; }        // from back

  const y = 14 + Math.random() * 18; // height 14–32 units

  // Random direction aimed roughly toward opposite side with some spread
  const angle = Math.atan2(-startZ, -startX) + (Math.random() - 0.5) * 1.2;
  const speed = 4 + Math.random() * 5;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);

  // Gentle vertical drift
  const driftY = (Math.random() - 0.5) * 0.4; // slow up/down oscillation speed

  group.position.set(startX, y, startZ);
  // Face direction of travel: atan2(dirX, dirZ) gives Y rotation so +Z is forward on the model
  group.rotation.y = Math.atan2(dirX, dirZ);

  const flapSpeed = 1.5 + Math.random() * 2.5;
  const flapOffset = Math.random() * Math.PI * 2;
  scene.add(group);

  seagulls.push({ group, leftWing, rightWing, speed, dirX, dirZ, driftY, flapSpeed, t: flapOffset });
}

export function updateScene(delta, scene) {
  // Spawn new seagulls occasionally (max 8 at a time)
  seagullSpawnTimer -= delta;
  const maxGulls = isNightMode ? 1 : 8;
  const spawnRate = isNightMode ? 0.04 : 1; // very rare at night
  if (seagullSpawnTimer <= 0 && seagulls.length < maxGulls && Math.random() < spawnRate) {
    spawnSeagull(scene);
    seagullSpawnTimer = isNightMode ? 20 + Math.random() * 30 : 1.5 + Math.random() * 4;
  }

  for (let i = seagulls.length - 1; i >= 0; i--) {
    const s = seagulls[i];
    s.t += delta;

    s.group.position.x += s.dirX * s.speed * delta;
    s.group.position.z += s.dirZ * s.speed * delta;
    // Gentle bobbing
    s.group.position.y += Math.sin(s.t * 0.7) * s.driftY * delta;

    // Flap wings
    const flap = Math.sin(s.t * s.flapSpeed * Math.PI * 2) * 0.38;
    s.leftWing.rotation.z = 0.15 + flap;
    s.rightWing.rotation.z = -(0.15 + flap);

    // Remove when well off screen
    const p = s.group.position;
    if (p.x > 65 || p.x < -65 || p.z > 65 || p.z < -65) {
      scene.remove(s.group);
      seagulls.splice(i, 1);
    }
  }
}

export function createScene(scene) {
  // 15% chance for night
  const night = Math.random() < 0.15; // ~15% chance — night is a rare treat
  isNightMode = night;

  // Sky + fog
  const skyColor = night ? 0x03030f : 0x87ceeb;
  scene.background = new THREE.Color(skyColor);
  scene.fog = night
    ? new THREE.Fog(0x050510, 8, 38)
    : new THREE.Fog(0x87ceeb, 20, 80);

  // Ambient light
  const ambientLight = new THREE.AmbientLight(
    night ? 0x1a2040 : 0xffffff,
    night ? 0.18 : 0.6
  );
  scene.add(ambientLight);

  // Sun / Moon directional light
  const dirLight = new THREE.DirectionalLight(
    night ? 0x8899bb : 0xfff4e6,
    night ? 0.25 : 0.8
  );
  dirLight.position.set(night ? -20 : 20, 40, night ? -15 : 10);
  dirLight.castShadow = true;
  dirLight.shadow.camera.left = -50;
  dirLight.shadow.camera.right = 50;
  dirLight.shadow.camera.top = 50;
  dirLight.shadow.camera.bottom = -50;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  if (night) {
    // Moon sphere
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xdde8f0 })
    );
    moon.position.set(-28, 38, -25);
    scene.add(moon);
    // Soft moon halo
    const moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.12 })
    );
    moonHalo.position.copy(moon.position);
    scene.add(moonHalo);
    // A handful of star sprites (simple points)
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 120; i++) {
      starVerts.push(
        (Math.random() - 0.5) * 180,
        20 + Math.random() * 60,
        (Math.random() - 0.5) * 180
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true })
    );
    scene.add(stars);
  } else {
    // Sun sphere + halo
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff176 })
    );
    sunMesh.position.set(30, 45, -30);
    scene.add(sunMesh);
    const haloMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffee58, transparent: true, opacity: 0.25 })
    );
    haloMesh.position.copy(sunMesh.position);
    scene.add(haloMesh);
  }

  // Ground (grass)
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a7c3b });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Road
  const roadGeometry = new THREE.PlaneGeometry(100, 8);
  const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -6);
  road.receiveShadow = true;
  scene.add(road);
  
  // Road markings
  const lineGeometry = new THREE.PlaneGeometry(80, 0.2);
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.position.set(0, 0.02, -6);
  scene.add(centerLine);
  
  // Sidewalk
  const sidewalkGeometry = new THREE.PlaneGeometry(12, 3);
  const sidewalkMaterial = new THREE.MeshLambertMaterial({ color: 0x999999 });
  const sidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(0, 0.01, -11.5);
  sidewalk.receiveShadow = true;
  scene.add(sidewalk);
  
  // Bus stop sign
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8);
  const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.set(-3, 1.25, -13);
  pole.castShadow = true;
  scene.add(pole);
  
  const signGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.1);
  const signMaterial = new THREE.MeshLambertMaterial({ color: 0x0066cc });
  const sign = new THREE.Mesh(signGeometry, signMaterial);
  sign.position.set(-3, 2.6, -13);
  sign.castShadow = true;
  scene.add(sign);
  
  // Bus shelter
  const shelterPoleGeometry = new THREE.BoxGeometry(0.15, 2.2, 0.15);
  const shelterPoleMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
  
  const pole1 = new THREE.Mesh(shelterPoleGeometry, shelterPoleMaterial);
  pole1.position.set(-1.5, 1.1, -13);
  pole1.castShadow = true;
  scene.add(pole1);
  
  const pole2 = new THREE.Mesh(shelterPoleGeometry, shelterPoleMaterial);
  pole2.position.set(1.5, 1.1, -13);
  pole2.castShadow = true;
  scene.add(pole2);
  
  const roofGeometry = new THREE.BoxGeometry(3.5, 0.1, 1.5);
  const roofMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(0, 2.2, -13);
  roof.castShadow = true;
  scene.add(roof);

  // Back wall of shelter (matches collider in main.js: centre z=-13.3, width 3.5, depth 0.15)
  const shelterWallGeo = new THREE.BoxGeometry(3.5, 2.2, 0.15);
  const shelterWallMat = new THREE.MeshLambertMaterial({ color: 0xaaaacc, transparent: true, opacity: 0.6 });
  const shelterWall = new THREE.Mesh(shelterWallGeo, shelterWallMat);
  shelterWall.position.set(0, 1.1, -13.3);
  scene.add(shelterWall);

  // Trees (simple forest)
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3c28 });
  
  const foliageGeometry = new THREE.ConeGeometry(1.5, 3, 8);
  const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
  
  // Create tree rows
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 12; i++) {
      const x = -18 + i * 3.5 + (Math.random() - 0.5) * 1.5;
      const z = 5 + row * 6 + (Math.random() - 0.5) * 2;
      
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.set(x, 1.5, z);
      trunk.castShadow = true;
      scene.add(trunk);
      
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.set(x, 4, z);
      foliage.castShadow = true;
      scene.add(foliage);
    }
  }
  
  // Additional scattered trees on the sides (kept clear of road z: -2 to -10)
  const sidePositions = [
    [-15, 0, -14], [-19, 0, -14], [-22, 0, -14],
    [15, 0, -14], [19, 0, -14], [22, 0, -14]
  ];
  
  sidePositions.forEach(pos => {
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(pos[0], 1.5, pos[2]);
    trunk.castShadow = true;
    scene.add(trunk);
    
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.set(pos[0], 4, pos[2]);
    foliage.castShadow = true;
    scene.add(foliage);
  });
  
  createKiosk(scene);
  addTerrainDetails(scene, night);

  return {
    ground,
    roadBounds: { minZ: -10, maxZ: -2 },
    isNight: night,
  };
}

function createKiosk(scene) {
  // Kiosk moved further back — front face at z ≈ -18.25
  const KX = 7, KZ = -20;
  const FZ = KZ + 1.75; // -18.25

  const wallMat  = new THREE.MeshLambertMaterial({ color: 0xf5e6c8 });
  const roofMat  = new THREE.MeshLambertMaterial({ color: 0x2c5f5f });
  const winMat   = new THREE.MeshLambertMaterial({ color: 0xb8d9f0 });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const doorMat  = new THREE.MeshLambertMaterial({ color: 0x7b4f2e });
  const signMat  = new THREE.MeshLambertMaterial({ color: 0xd32f2f });
  const poleMat  = new THREE.MeshLambertMaterial({ color: 0x999999 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3.5), wallMat);
  body.position.set(KX, 1.5, KZ);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.28, 4.0), roofMat);
  roof.position.set(KX, 3.14, KZ);
  roof.castShadow = true;
  scene.add(roof);

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.08), doorMat);
  door.position.set(KX, 1.05, FZ + 0.01);
  scene.add(door);

  // Door frame
  const dfTop = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.1, 0.09), frameMat);
  dfTop.position.set(KX, 2.15, FZ + 0.015);
  scene.add(dfTop);
  const dfL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.1, 0.09), frameMat);
  dfL.position.set(KX - 0.555, 1.05, FZ + 0.015);
  scene.add(dfL);
  const dfR = dfL.clone();
  dfR.position.x = KX + 0.555;
  scene.add(dfR);

  // Windows
  const wFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.85, 0.09), frameMat);
  wFrame.position.set(KX - 1.7, 1.9, FZ + 0.01);
  scene.add(wFrame);
  const wGlass = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.09), winMat);
  wGlass.position.set(KX - 1.7, 1.9, FZ + 0.015);
  scene.add(wGlass);
  const wFrame2 = wFrame.clone(); wFrame2.position.x = KX + 1.7; scene.add(wFrame2);
  const wGlass2 = wGlass.clone(); wGlass2.position.x = KX + 1.7; scene.add(wGlass2);

  // Sign above door
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 0.09), signMat);
  sign.position.set(KX, 2.65, FZ + 0.01);
  scene.add(sign);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }));
  stripe.position.set(KX, 2.65, FZ + 0.015);
  scene.add(stripe);

  // Step
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.35), frameMat);
  step.position.set(KX, 0.06, FZ + 0.195);
  scene.add(step);

  // --- Outdoor seating in front-left of kiosk ---
  const TX = KX - 4.0, TZ = FZ + 1.0; // moved in front of kiosk

  const tableMat  = new THREE.MeshLambertMaterial({ color: 0xd0c5b0 });
  const chairMat  = new THREE.MeshLambertMaterial({ color: 0x88aa66 });
  const parasolMat = new THREE.MeshLambertMaterial({ color: 0xf4a261 });

  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 14), tableMat);
  tableTop.position.set(TX, 0.82, TZ);
  tableTop.castShadow = true;
  scene.add(tableTop);

  const tablePole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.82, 8), poleMat);
  tablePole.position.set(TX, 0.41, TZ);
  scene.add(tablePole);

  function makeChair(cx, cz, ry) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.38), chairMat);
    seat.position.y = 0.42;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.06), chairMat);
    back.position.set(0, 0.69, -0.16);
    g.add(back);
    for (const [lx, lz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), poleMat);
      leg.position.set(lx, 0.21, lz);
      g.add(leg);
    }
    g.position.set(cx, 0, cz);
    g.rotation.y = ry;
    g.castShadow = true;
    scene.add(g);
  }
  makeChair(TX - 0.62, TZ, Math.PI / 2);
  makeChair(TX + 0.62, TZ, -Math.PI / 2);

  const pPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), poleMat);
  pPole.position.set(TX, 1.15, TZ);
  scene.add(pPole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.42, 12), parasolMat);
  canopy.position.set(TX, 2.51, TZ);
  canopy.castShadow = true;
  scene.add(canopy);

  // --- Gravel path from kiosk door to sidewalk ---
  // Door at (KX=7, FZ=-18.25) → sidewalk edge at (~2, -13.5)
  const pathMat = new THREE.MeshLambertMaterial({ color: 0xb8a88a }); // sandy gravel
  const pStartX = 7,  pStartZ = -18;
  const pEndX   = 2,  pEndZ   = -13.5;
  const pMidX   = (pStartX + pEndX) / 2;  // 4.5
  const pMidZ   = (pStartZ + pEndZ) / 2;  // -15.75
  const pdx = pEndX - pStartX, pdz = pEndZ - pStartZ;
  const pLen = Math.sqrt(pdx * pdx + pdz * pdz);
  const pAngle = Math.atan2(pdx, pdz);
  const pathMesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.025, pLen), pathMat);
  pathMesh.position.set(pMidX, 0.013, pMidZ);
  pathMesh.rotation.y = pAngle;
  pathMesh.receiveShadow = true;
  scene.add(pathMesh);
}

function addTerrainDetails(scene, night = false) {
  // ---- Material palette ----
  const grassMat   = new THREE.MeshLambertMaterial({ color: 0x4a9c3a, side: THREE.DoubleSide });
  const bushMat    = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const bushMat2   = new THREE.MeshLambertMaterial({ color: 0x388e3c });
  const litterMat  = new THREE.MeshLambertMaterial({ color: 0xcccccc });
  const binMat     = new THREE.MeshLambertMaterial({ color: 0x455a64 });
  const binLidMat  = new THREE.MeshLambertMaterial({ color: 0x37474f });
  const lampMat    = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const lampGlow   = new THREE.MeshLambertMaterial({ color: 0xfffde7 });
  const pudMat     = new THREE.MeshBasicMaterial({ color: 0x6a8fa8, transparent: true, opacity: 0.55 });
  const bollardMat = new THREE.MeshLambertMaterial({ color: 0xe65100 });
  const benchMat   = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });

  // ---- Helper functions ----
  function grassTuft(x, z) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.42, 0.32);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, grassMat);
      m.position.set((Math.random() - 0.5) * 0.2, 0.16, (Math.random() - 0.5) * 0.2);
      m.rotation.y = (i / 3) * Math.PI;
      g.add(m);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    scene.add(g);
  }

  function bush(x, z, scale = 1) {
    const mat = Math.random() < 0.5 ? bushMat : bushMat2;
    const g = new THREE.Group();
    // 3 overlapping spheres for a lumpy bush shape
    for (const [ox, oy, oz, r] of [
      [0, 0, 0, 0.55], [-0.3, -0.1, 0.1, 0.42], [0.28, -0.05, -0.1, 0.40]
    ]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 8, 6), mat);
      m.position.set(ox * scale, oy * scale + r * scale, oz * scale);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function litter(x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.18), litterMat);
    m.position.set(x, 0.013, z);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
  }

  function lamppost(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 4.5, 8), lampMat);
    pole.position.set(x, 2.25, z);
    pole.castShadow = true;
    scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), lampMat);
    arm.position.set(x + 0.35, 4.55, z);
    scene.add(arm);
    // Bulb — glowing emissive at night
    const bulbMat = night
      ? new THREE.MeshBasicMaterial({ color: 0xffd07a })
      : lampGlow;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bulbMat);
    bulb.position.set(x + 0.7, 4.45, z);
    scene.add(bulb);
    if (night) {
      // Warm point light casting a cone of light below the lamp
      const pt = new THREE.PointLight(0xffc060, 2.2, 9, 1.8);
      pt.position.set(x + 0.7, 4.4, z);
      scene.add(pt);
      // Subtle glow halo around bulb
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa30, transparent: true, opacity: 0.18 })
      );
      halo.position.copy(pt.position);
      scene.add(halo);
    }
  }

  function trashCan(x, z) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.72, 10), binMat);
    body.position.set(x, 0.36, z);
    body.castShadow = true;
    scene.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.18, 0.08, 10), binLidMat);
    lid.position.set(x, 0.76, z);
    scene.add(lid);
  }

  function bench(x, z, ry = 0) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.38), benchMat);
    seat.position.y = 0.46;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 0.07), benchMat);
    back.position.set(0, 0.72, -0.155);
    g.add(back);
    for (const lx of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.38), benchMat);
      leg.position.set(lx, 0.23, 0);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.castShadow = true;
    scene.add(g);
  }

  function bollard(x, z) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), bollardMat);
    b.position.set(x, 0.3, z);
    scene.add(b);
  }

  function puddle(x, z, w = 1.4, d = 0.7) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pudMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    scene.add(m);
  }

  // ---- Place objects ----

  // Lampposts along the path / sidewalk area
  lamppost(-5, -12);
  lamppost( 4, -12);
  lamppost( 7, -16.5);

  // Bench near bus shelter
  bench(5, -12.5);
  bench(-5.5, -12.8, 0.2);

  // Trash cans
  trashCan( 2.8, -12.3);
  trashCan(-3.5, -13.2);

  // Bollards along road edge at bus stop zone
  for (const bx of [-8, -4, 0, 4, 8]) bollard(bx, -10.1);

  // Bushes scattered around shelter area and path sides
  bush(-7,  -14);
  bush(-8.5,-16.5);
  bush(-5.5,-17.5);
  bush( 11, -13.5);
  bush( 12, -16.5);
  bush(-4,  -15.5, 0.8);
  bush( 9,  -17,   0.9);

  // Small deciduous trees (sphere canopy on trunk) — a few near kiosk path
  const smTrunkMat   = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
  const smCanopyMat  = new THREE.MeshLambertMaterial({ color: 0x388e3c });
  function smallTree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 8), smTrunkMat);
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), smCanopyMat);
    canopy.position.set(x, 2.05, z);
    canopy.castShadow = true;
    scene.add(canopy);
  }
  smallTree(-9, -14.5);
  smallTree(-10, -17);
  smallTree( 13, -14);
  smallTree( 13.5, -17.5);
  smallTree(-7,  -19);

  // Trees behind the kiosk (z < -22, away from road)
  const behindKioskTrees = [
    [4,  -23], [7,  -24], [10, -23.5], [12, -25], [5.5, -26],
    [8.5,-26], [2,  -25], [11, -27],   [6,  -28], [9,  -28.5],
    [3,  -27], [13, -23],
  ];
  for (const [tx, tz] of behindKioskTrees) {
    // Mix of small deciduous and conifer trees for variety
    if (Math.random() < 0.55) {
      smallTree(tx + (Math.random()-0.5)*1.2, tz + (Math.random()-0.5)*1.2);
    } else {
      const scale = 0.75 + Math.random() * 0.5;
      const trunk2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 3 * scale, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a3c28 })
      );
      trunk2.position.set(tx, 1.5 * scale, tz);
      trunk2.castShadow = true;
      scene.add(trunk2);
      const foliage2 = new THREE.Mesh(
        new THREE.ConeGeometry(1.5 * scale, 3 * scale, 8),
        new THREE.MeshLambertMaterial({ color: 0x2d5016 })
      );
      foliage2.position.set(tx, 4 * scale, tz);
      foliage2.castShadow = true;
      scene.add(foliage2);
    }
  }

  // Grass tufts throughout open areas (avoid road z:-2 to -10, sidewalk z:-10 to -13)
  const tuftPositions = [
    [-12, -14], [-13, -16], [-11, -18], [-9, -15.5],
    [ 14, -14], [ 15, -17], [ 13, -19],
    [-6,  -16], [-5,  -18], [-3,  -17],
    [ 9,  -15], [10,  -18],
    [-14,  4], [-10,   5], [ 10,   2],
    [-5,   3], [  5,   4], [ 12,   1],
  ];
  for (const [tx, tz] of tuftPositions) grassTuft(tx, tz);

  // Litter near trash cans and bus stop
  litter(3.5, -12.1);
  litter(2.2, -13.0);
  litter(-3.0, -13.8);
  litter(4.0, -11.8);
  litter(-2.5, -12.4);

  // Puddles on the pavement
  puddle(-1.5, -11.5, 1.2, 0.5);
  puddle( 6,   -11.8, 0.9, 0.4);
}

