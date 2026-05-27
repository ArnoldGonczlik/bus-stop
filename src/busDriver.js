import * as THREE from 'three';

// ─── Driver messages ───────────────────────────────────────────────────────
const DRIVER_MSG = {
  en: "GET OUT! YOU DON'T HAVE ENOUGH MONEY!",
  no: "HESTKUK! DU HAR'KKE NÅK PENGAN! KÆIN DU'KKE TELL LELL?!",
};

// ─── Bubble geometry constants (same system as passengers) ─────────────────
const BUBBLE_W        = 512;
const BUBBLE_H        = 170;
const BUBBLE_TAIL     = 26;
const BUBBLE_CANVAS_H = BUBBLE_H + BUBBLE_TAIL;
const PLANE_W         = 1.9;
const PLANE_H         = PLANE_W * (BUBBLE_CANVAS_H / BUBBLE_W);

// ─── Leg rotation keyframes ────────────────────────────────────────────────
// Rx rotates +Y toward +Z. Foot hangs at local -Y from pivot.
//   Rx(-π/2): foot goes to +Z → inside bus  ✓
//   Rx( 0  ): foot hangs straight down
//   Rx(+π×0.55): foot swings strongly toward -Z → toward player  ✓
const LEG_INSIDE =  -Math.PI / 2;      // retracted into bus
const LEG_HANG   =   0;                // hanging straight down
const LEG_KICK   =   Math.PI * 0.55;   // kicked hard toward player (–Z)

// ─── State ─────────────────────────────────────────────────────────────────
// phases: idle → reading → emerging → kicking → hold → retracting → cutscene
let phase         = 'idle';
let phaseTimer    = 0;
let cutsceneTimer = 0;

let legGroup       = null;
let driverBubble   = null;
let _kickCb        = null;
let _doneCb        = null;
let _passengersRef = null;
let _busRef        = null;

// Camera smooth look-at
const _lookNow  = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _lookQuat = new THREE.Quaternion();
const _lookMat  = new THREE.Matrix4();
const _up       = new THREE.Vector3(0, 1, 0);

// ─── Helpers ───────────────────────────────────────────────────────────────
function eio(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
function lerp(a, b, t) { return a + (b - a) * eio(Math.min(1, Math.max(0, t))); }

// ─── 3-D leg mesh ──────────────────────────────────────────────────────────
function buildLeg(scene) {
  const root = new THREE.Group();

  const jeans = new THREE.MeshLambertMaterial({ color: 0x1e3a7a });
  const shoe  = new THREE.MeshLambertMaterial({ color: 0x160800 });
  const sole  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const sock  = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });

  function add(geo, mat, px, py, pz, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px || 0, py || 0, pz || 0);
    if (sx) m.scale.set(sx, sy, sz);
    m.castShadow = true;
    root.add(m);
    return m;
  }

  // ── thigh ──
  add(new THREE.CylinderGeometry(0.13, 0.11, 0.50, 10), jeans, 0, -0.25, 0);

  // ── shin ──
  add(new THREE.CylinderGeometry(0.10, 0.085, 0.44, 10), jeans, 0, -0.25-0.25-0.22-0.02, 0);

  // ── ankle sock ──
  add(new THREE.CylinderGeometry(0.092, 0.086, 0.10, 8), sock, 0, -0.25-0.25-0.44-0.04, 0);

  // ── shoe body ──  (elongated box, toe sticks in –Z direction)
  const shoeY = -0.25-0.25-0.44-0.09-0.07;
  add(new THREE.BoxGeometry(0.20, 0.14, 0.44), shoe, 0, shoeY, -0.09);

  // ── toe cap ──
  const toeCap = add(new THREE.SphereGeometry(0.10, 8, 6), shoe, 0, shoeY, -0.09 - 0.19);
  toeCap.scale.set(1, 0.75, 1);

  // ── sole ──
  add(new THREE.BoxGeometry(0.22, 0.05, 0.46), sole, 0, shoeY - 0.095, -0.09);

  root.visible = false;
  scene.add(root);
  return root;
}

// ─── Chat bubble ───────────────────────────────────────────────────────────
function buildBubble(scene) {
  const canvas   = document.createElement('canvas');
  canvas.width   = BUBBLE_W;
  canvas.height  = BUBBLE_CANVAS_H;
  const ctx      = canvas.getContext('2d');
  const texture  = new THREE.CanvasTexture(canvas);
  texture.minFilter  = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_W, PLANE_H), mat);
  mesh.visible     = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, ctx, texture };
}

function drawBubble(ctx, text) {
  const W = BUBBLE_W, H = BUBBLE_CANVAS_H, bH = BUBBLE_H, r = 20;
  ctx.clearRect(0, 0, W, H);

  function path() {
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(W-r, 0); ctx.arcTo(W, 0, W, r, r);
    ctx.lineTo(W, bH-r); ctx.arcTo(W, bH, W-r, bH, r);
    ctx.lineTo(W/2+BUBBLE_TAIL, bH); ctx.lineTo(W/2, H); ctx.lineTo(W/2-BUBBLE_TAIL, bH);
    ctx.lineTo(r, bH); ctx.arcTo(0, bH, 0, bH-r, r);
    ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
  }

  // Background – angry red tint
  path(); ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.lineWidth = 10; ctx.stroke();
  ctx.fillStyle = 'rgba(255,225,225,0.97)'; ctx.fill();
  path(); ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 6; ctx.stroke();

  // Word-wrapped text
  const maxTW = W - 60;
  ctx.font = 'bold 27px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxTW) { cur = test; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const lineH = 36;
  const startY = bH/2 - (lines.length * lineH)/2 + lineH/2;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 4;
  for (let i = 0; i < lines.length; i++) ctx.strokeText(lines[i], W/2, startY + i*lineH);
  ctx.fillStyle = '#7d0000';
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W/2, startY + i*lineH);
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Call once on scene setup. */
export function createBusDriver(scene) {
  legGroup     = buildLeg(scene);
  driverBubble = buildBubble(scene);
}

/**
 * Start the rejection sequence.
 * @param {object} opts
 *   busCurrentX, passengers, camera, bus, lang,
 *   onKick (called when foot makes contact),
 *   onDone (called when 10-second cutscene ends)
 */
export function triggerRejection({ busCurrentX, passengers, camera, bus, lang, onKick, onDone }) {
  if (phase !== 'idle') return;

  _passengersRef = passengers;
  _busRef        = bus;
  _kickCb        = onKick;
  _doneCb        = onDone;

  // Place leg at bus door frame
  const doorX = busCurrentX + 3.5;
  legGroup.position.set(doorX, 1.3, -7.5);
  legGroup.rotation.set(LEG_INSIDE, 0, 0);
  legGroup.visible = true;

  // Show angry driver bubble
  const msg = DRIVER_MSG[lang] || DRIVER_MSG.en;
  drawBubble(driverBubble.ctx, msg);
  driverBubble.texture.needsUpdate = true;
  driverBubble.mesh.position.set(doorX, 3.8, -7.5);
  if (camera) driverBubble.mesh.quaternion.copy(camera.quaternion);
  driverBubble.mesh.visible = true;

  phase      = 'reading';
  phaseTimer = 0;
  cutsceneTimer = 0;
}

/**
 * True only after the cutscene phase has been active for >1 second.
 * Main uses this to gate when the bus starts driving away.
 */
export function shouldDriveBus() { return phase === 'cutscene' && cutsceneTimer > 1.0; }

/** Call every frame from main animate loop. */
export function updateBusDriver(delta, camera, busCurrentX) {
  if (phase === 'idle') return;

  phaseTimer += delta;
  const doorX = busCurrentX + 3.5;

  // Keep leg + bubble pinned to door position
  if (legGroup) legGroup.position.x = doorX;
  if (driverBubble?.mesh.visible && camera) {
    driverBubble.mesh.position.set(doorX, 3.0, -7.5);
    driverBubble.mesh.quaternion.copy(camera.quaternion);
  }

  // ── Smooth camera look-at ───────────────────────────────────────────────
  if (camera) {
    if (phase === 'cutscene') {
      _lookGoal.set(_busRef ? _busRef.position.x + 8 : doorX + 14, 2.0, -6);
    } else {
      // Look at a point between the bubble and the leg so both are in frame
      _lookGoal.set(doorX, 2.5, -7.5);
    }
    _lookMat.lookAt(camera.position, _lookGoal, _up);
    _lookQuat.setFromRotationMatrix(_lookMat);
    const speed = phase === 'cutscene' ? delta * 1.2 : delta * 5.0;
    camera.quaternion.slerp(_lookQuat, Math.min(1, speed));
  }

  // ── Phase logic ─────────────────────────────────────────────────────────
  if (phase === 'reading') {
    // Player reads the bubble — 2.2 s pause before leg appears
    if (phaseTimer >= 2.2) { phase = 'emerging'; phaseTimer = 0; }

  } else if (phase === 'emerging') {
    // Leg swings out of bus to hanging position (0.45 s)
    legGroup.rotation.x = lerp(LEG_INSIDE, LEG_HANG, phaseTimer / 0.45);
    if (phaseTimer >= 0.45) { phase = 'kicking'; phaseTimer = 0; }

  } else if (phase === 'kicking') {
    // Leg kicks HARD toward player (0.22 s — fast and snappy)
    legGroup.rotation.x = lerp(LEG_HANG, LEG_KICK, phaseTimer / 0.22);
    // Contact at 55 %
    if (phaseTimer >= 0.12 && _kickCb) { _kickCb(); _kickCb = null; }
    if (phaseTimer >= 0.22) { phase = 'hold'; phaseTimer = 0; }

  } else if (phase === 'hold') {
    // Foot held out so the impact registers (0.35 s)
    if (phaseTimer >= 0.35) { phase = 'retracting'; phaseTimer = 0; }

  } else if (phase === 'retracting') {
    // Leg pulls back inside (0.5 s); bubble fades halfway through
    legGroup.rotation.x = lerp(LEG_KICK, LEG_INSIDE, phaseTimer / 0.5);
    if (phaseTimer >= 0.25 && driverBubble.mesh.visible) {
      driverBubble.mesh.visible = false;
    }
    if (phaseTimer >= 0.5) {
      legGroup.visible = false;
      if (_passengersRef) {
        _passengersRef.forEach(p => {
          p.mesh.visible        = false;
          p.bubble.mesh.visible = false;
        });
      }
      phase = 'cutscene'; phaseTimer = 0; cutsceneTimer = 0;
    }

  } else if (phase === 'cutscene') {
    cutsceneTimer += delta;
    if (cutsceneTimer >= 10) {
      phase = 'idle';
      if (_doneCb) { _doneCb(); _doneCb = null; }
    }
  }
}

/** Reset to clean state (call on game reset). */
export function resetBusDriver() {
  phase         = 'idle';
  phaseTimer    = 0;
  cutsceneTimer = 0;
  _kickCb  = null;
  _doneCb  = null;
  _passengersRef = null;
  if (legGroup)     { legGroup.visible = false; legGroup.rotation.x = LEG_INSIDE; }
  if (driverBubble) { driverBubble.mesh.visible = false; }
}

