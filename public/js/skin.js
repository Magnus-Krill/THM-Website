/* THM · 3D Minecraft skin viewer
   Config comes from the canvas element, so this file is shared by every profile:
     <canvas id="skin-canvas" data-username="Ryazor" data-slim="false"></canvas>
   Needs three.js loaded first. */
'use strict';
(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('skin-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const SLIM_ARMS = canvas.dataset.slim === 'true';   // true = Alex (3 px arms)
  // Fetched live from Minotar by username, so it follows the player's current
  // skin (within Minotar's ~6h cache). Falls back to a flat Steve if it fails.
  const SKIN_FILE = 'https://minotar.net/skin/' +
    encodeURIComponent(canvas.dataset.username || 'Steve') + '.webp';
  const CANVAS_W  = 220;
  const CANVAS_H  = 300;

  // ─── Renderer ──────────────────────────────────────────────────────────────
  canvas.style.width  = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(CANVAS_W, CANVAS_H);
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, CANVAS_W / CANVAS_H, 0.1, 200);
  camera.position.set(0, 0, 70);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(4, 8, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa78bfa, 0.2);
  rim.position.set(-5, -3, -4);
  scene.add(rim);

  // ─── UV helper ─────────────────────────────────────────────────────────────
  const TX = 64;

  function faceUV(px, py, pw, ph, mirrorX) {
    let u0 = px / TX,        u1 = (px + pw) / TX;
    let v1 = 1 - py / TX,    v0 = 1 - (py + ph) / TX;
    if (mirrorX) { const t = u0; u0 = u1; u1 = t; }
    return [u0, v1,  u1, v1,  u0, v0,  u1, v0];
  }

  function setUVs(geo, f) {
    const flat = [];
    for (const face of f) flat.push(...face);
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat), 2));
  }

  function buildModel(tex) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    const solid = new THREE.MeshLambertMaterial({ map: tex });
    const trans = new THREE.MeshLambertMaterial({
      map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide
    });

    function box(w, h, d, uvFaces, mat) {
      const g = new THREE.BoxGeometry(w, h, d);
      setUVs(g, uvFaces);
      return new THREE.Mesh(g, mat || solid);
    }

    const aw = SLIM_ARMS ? 3 : 4;

    const head = box(8, 8, 8, [
      faceUV(16,  8, 8, 8),
      faceUV( 0,  8, 8, 8),
      faceUV( 8,  0, 8, 8),
      faceUV(16,  0, 8, 8),
      faceUV( 8,  8, 8, 8),
      faceUV(24,  8, 8, 8),
    ]);
    head.position.y = 10;

    const hat = box(9, 9, 9, [
      faceUV(48,  8, 8, 8),
      faceUV(32,  8, 8, 8, true),
      faceUV(40,  0, 8, 8),
      faceUV(48,  0, 8, 8),
      faceUV(40,  8, 8, 8),
      faceUV(56,  8, 8, 8),
    ], trans);
    hat.position.y = 10;

    const body = box(8, 12, 4, [
      faceUV(28, 20, 4, 12),
      faceUV(16, 20, 4, 12, true),
      faceUV(20, 16, 8,  4),
      faceUV(28, 16, 8,  4),
      faceUV(20, 20, 8, 12),
      faceUV(32, 20, 8, 12),
    ]);

    const bodyOv = box(8.5, 12.5, 4.5, [
      faceUV(28, 36, 4, 12),
      faceUV(16, 36, 4, 12, true),
      faceUV(20, 32, 8,  4),
      faceUV(28, 32, 8,  4),
      faceUV(20, 36, 8, 12),
      faceUV(32, 36, 8, 12),
    ], trans);

    const rArm = box(aw, 12, 4, [
      faceUV(44,      20, 4,  12),
      faceUV(40,      20, 4,  12, true),
      faceUV(44,      16, aw,  4),
      faceUV(44 + aw, 16, aw,  4),
      faceUV(44,      20, aw, 12),
      faceUV(44 + aw, 20, aw, 12),
    ]);
    rArm.position.set(-(4 + aw / 2), 0, 0);

    const rArmOv = box(aw + 0.5, 12.5, 4.5, [
      faceUV(44,      36, 4,  12),
      faceUV(40,      36, 4,  12, true),
      faceUV(44,      32, aw,  4),
      faceUV(44 + aw, 32, aw,  4),
      faceUV(44,      36, aw, 12),
      faceUV(44 + aw, 36, aw, 12),
    ], trans);
    rArmOv.position.set(-(4 + aw / 2), 0, 0);

    const lArm = box(aw, 12, 4, [
      faceUV(36,      52, 4,  12),
      faceUV(32,      52, 4,  12, true),
      faceUV(36,      48, aw,  4),
      faceUV(36 + aw, 48, aw,  4),
      faceUV(36,      52, aw, 12),
      faceUV(36 + aw, 52, aw, 12),
    ]);
    lArm.position.set(4 + aw / 2, 0, 0);

    const lArmOv = box(aw + 0.5, 12.5, 4.5, [
      faceUV(52,      52, 4,  12),
      faceUV(48,      52, 4,  12, true),
      faceUV(52,      48, aw,  4),
      faceUV(52 + aw, 48, aw,  4),
      faceUV(52,      52, aw, 12),
      faceUV(52 + aw, 52, aw, 12),
    ], trans);
    lArmOv.position.set(4 + aw / 2, 0, 0);

    const rLeg = box(4, 12, 4, [
      faceUV( 8, 20, 4, 12),
      faceUV( 0, 20, 4, 12, true),
      faceUV( 4, 16, 4,  4),
      faceUV( 8, 16, 4,  4),
      faceUV( 4, 20, 4, 12),
      faceUV(12, 20, 4, 12),
    ]);
    rLeg.position.set(-2, -12, 0);

    const rLegOv = box(4.5, 12.5, 4.5, [
      faceUV( 8, 36, 4, 12),
      faceUV( 0, 36, 4, 12, true),
      faceUV( 4, 32, 4,  4),
      faceUV( 8, 32, 4,  4),
      faceUV( 4, 36, 4, 12),
      faceUV(12, 36, 4, 12),
    ], trans);
    rLegOv.position.set(-2, -12, 0);

    const lLeg = box(4, 12, 4, [
      faceUV(24, 52, 4, 12),
      faceUV(16, 52, 4, 12, true),
      faceUV(20, 48, 4,  4),
      faceUV(24, 48, 4,  4),
      faceUV(20, 52, 4, 12),
      faceUV(28, 52, 4, 12),
    ]);
    lLeg.position.set(2, -12, 0);

    const lLegOv = box(4.5, 12.5, 4.5, [
      faceUV( 8, 52, 4, 12),
      faceUV( 0, 52, 4, 12, true),
      faceUV( 4, 48, 4,  4),
      faceUV( 8, 48, 4,  4),
      faceUV( 4, 52, 4, 12),
      faceUV(12, 52, 4, 12),
    ], trans);
    lLegOv.position.set(2, -12, 0);

    const group = new THREE.Group();
    group.add(
      head, hat,
      body, bodyOv,
      rArm, rArmOv,
      lArm, lArmOv,
      rLeg, rLegOv,
      lLeg, lLegOv
    );
    group.position.y = 2;
    scene.add(group);
    return group;
  }

  // ─── Load texture ──────────────────────────────────────────────────────────
  let model = null;

  function fallbackTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c69b6d'; ctx.fillRect(8, 8, 8, 8);
    ctx.fillStyle = '#7b4e2d'; ctx.fillRect(0, 8, 8, 8);
    ctx.fillStyle = '#3a7abf'; ctx.fillRect(20,20, 8,12);
    ctx.fillStyle = '#3a7abf'; ctx.fillRect(44,20, 4,12);
    return new THREE.CanvasTexture(c);
  }

  const skinLoader = new THREE.TextureLoader();
  skinLoader.setCrossOrigin('anonymous');
  skinLoader.load(
    SKIN_FILE,
    tex  => { model = buildModel(tex); },
    undefined,
    ()   => { model = buildModel(fallbackTex()); }
  );

  // ─── Interaction ───────────────────────────────────────────────────────────
  let drag = false, px = 0, py = 0;
  let rotY = 0.5, rotX = 0.15;
  let tY = rotY, tX = rotX;
  let autoSpin = true;

  canvas.addEventListener('mousedown',  e => { drag = true;  px = e.clientX; py = e.clientY; autoSpin = false; });
  window .addEventListener('mouseup',   () => { drag = false; });
  window .addEventListener('mousemove', e => {
    if (!drag) return;
    tY += (e.clientX - px) * 0.013; px = e.clientX;
    tX += (e.clientY - py) * 0.013; py = e.clientY;
    tX = Math.max(-1.0, Math.min(1.0, tX));
  });
  canvas.addEventListener('touchstart', e => { drag = true;  px = e.touches[0].clientX; py = e.touches[0].clientY; autoSpin = false; e.preventDefault(); }, { passive: false });
  window .addEventListener('touchend',  () => { drag = false; });
  window .addEventListener('touchmove', e => {
    if (!drag) return;
    tY += (e.touches[0].clientX - px) * 0.013; px = e.touches[0].clientX;
    tX += (e.touches[0].clientY - py) * 0.013; py = e.touches[0].clientY;
    tX = Math.max(-1.0, Math.min(1.0, tX));
  });
  canvas.addEventListener('wheel', e => {
    camera.position.z = Math.max(24, Math.min(72, camera.position.z + e.deltaY * 0.06));
  }, { passive: true });

  // ─── Render loop ───────────────────────────────────────────────────────────
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0;
  (function loop() {
    requestAnimationFrame(loop);
    t += 0.016;
    if (model) {
      if (autoSpin && !reducedMotion) { tY = t * 0.35; tX = Math.sin(t * 0.22) * 0.1; }
      rotY += (tY - rotY) * 0.08;
      rotX += (tX - rotX) * 0.08;
      model.rotation.y = rotY;
      model.rotation.x = rotX;
      model.position.y = reducedMotion ? 2 : 2 + Math.sin(t * 1.1) * 0.18;
    }
    renderer.render(scene, camera);
  })();
})();

