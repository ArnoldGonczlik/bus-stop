import * as THREE from 'three';

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
  
  // Additional scattered trees on the sides
  const sidePositions = [
    [-15, 0, -15], [-18, 0, -10], [-20, 0, -5],
    [15, 0, -15], [18, 0, -10], [20, 0, -5]
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

