import * as THREE from 'three';

export function createBus() {
  const busGroup = new THREE.Group();
  
  // Bus body
  const bodyGeometry = new THREE.BoxGeometry(10, 3, 2.8);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.set(0, 1.8, 0);
  body.castShadow = true;
  busGroup.add(body);
  
  // Front cabin
  const cabinGeometry = new THREE.BoxGeometry(2, 2.2, 2.6);
  const cabinMaterial = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
  cabin.position.set(5.5, 2.2, 0);
  cabin.castShadow = true;
  busGroup.add(cabin);
  
  // Windshield
  const windshieldGeometry = new THREE.BoxGeometry(0.1, 1.5, 2.3);
  const windshieldMaterial = new THREE.MeshLambertMaterial({ color: 0x87ceeb });
  const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
  windshield.position.set(6.5, 2.3, 0);
  busGroup.add(windshield);
  
  // Windows
  const windowGeometry = new THREE.BoxGeometry(6, 1.2, 0.1);
  const windowMaterial = new THREE.MeshLambertMaterial({ color: 0x87ceeb });
  
  const windowLeft = new THREE.Mesh(windowGeometry, windowMaterial);
  windowLeft.position.set(0, 2.2, 1.4);
  busGroup.add(windowLeft);
  
  const windowRight = new THREE.Mesh(windowGeometry, windowMaterial);
  windowRight.position.set(0, 2.2, -1.4);
  busGroup.add(windowRight);
  
  // Front door area (visible gap) - on the right side facing the player
  const doorFrameGeometry = new THREE.BoxGeometry(1.5, 2.5, 0.15);
  const doorFrameMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const doorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
  doorFrame.position.set(3.5, 1.5, -1.5); // Changed from 1.5 to -1.5 to put door on player's side
  busGroup.add(doorFrame);
  
  // Wheels
  const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  
  const wheelPositions = [
    [4, 0.5, 1.5],
    [4, 0.5, -1.5],
    [-3, 0.5, 1.5],
    [-3, 0.5, -1.5]
  ];
  
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    busGroup.add(wheel);
  });
  
  // Headlights
  const headlightGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.5);
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffff99 });
  
  const headlightLeft = new THREE.Mesh(headlightGeometry, headlightMaterial);
  headlightLeft.position.set(6.5, 1.3, 0.8);
  busGroup.add(headlightLeft);
  
  const headlightRight = new THREE.Mesh(headlightGeometry, headlightMaterial);
  headlightRight.position.set(6.5, 1.3, -0.8);
  busGroup.add(headlightRight);
  
  // Undercarriage
  const undercarriageGeometry = new THREE.BoxGeometry(9, 0.3, 2.5);
  const undercarriageMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const undercarriage = new THREE.Mesh(undercarriageGeometry, undercarriageMaterial);
  undercarriage.position.set(0, 0.3, 0);
  undercarriage.castShadow = true;
  busGroup.add(undercarriage);
  
  return busGroup;
}

