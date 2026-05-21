import * as THREE from 'three';

// Seagull state kept module-level so updateScene() can animate them
const seagulls = [];
let seagullSpawnTimer = 0;

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
  if (seagullSpawnTimer <= 0 && seagulls.length < 8) {
    spawnSeagull(scene);
    seagullSpawnTimer = 1.5 + Math.random() * 4;
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
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 0.8);
  sunLight.position.set(20, 40, 10);
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  scene.add(sunLight);

  // Sun — visible sphere in the sky matching light direction
  const sunGeo = new THREE.SphereGeometry(2.8, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff176 });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.set(30, 45, -30);
  scene.add(sunMesh);

  // Sun glow halo (slightly larger, semi-transparent)
  const haloGeo = new THREE.SphereGeometry(4.2, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffee58, transparent: true, opacity: 0.25 });
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.position.copy(sunMesh.position);
  scene.add(haloMesh);

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
  
  return {
    ground,
    roadBounds: { minZ: -10, maxZ: -2 }
  };
}

