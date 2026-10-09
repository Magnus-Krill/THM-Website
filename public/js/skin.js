/* Minecraft skin preview. Outer-layer pixels are merged into six voxel meshes. */
'use strict';
window.thmSkin = function (canvas, signal) {
  if (!canvas?.isConnected || signal.aborted || canvas.dataset.live || !window.THREE) return;
  const T = window.THREE;
  canvas.dataset.live = '1';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    canvas.dataset.live = '';
    canvas.closest('.plate').querySelector('.skin-hint').textContent = 'Skin preview unavailable';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(280, 360, false);
  renderer.outputEncoding = T.sRGBEncoding;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 280 / 360, .1, 150);
  camera.position.set(0, 3, 70);
  camera.lookAt(0, 0, 0);
  scene.add(new T.HemisphereLight(0xffffff, 0x8ca8c4, 1.0));
  const key = new T.DirectionalLight(0xffffff, .75);
  key.position.set(-12, 20, 30);
  scene.add(key);
  const rim = new T.DirectionalLight(0xd7e8ff, .35);
  rim.position.set(12, 8, -10);
  scene.add(rim);
  const model = new T.Group();
  scene.add(model);
  const geometries = new Set();
  const materials = new Set();
  let texture;
  let frame = 0;
  let visible = false;
  let loaded = false;
  let disposed = false;
  let dragging = false;
  let paused = false;
  const spinButton = canvas.closest('.plate')?.querySelector('.skin-spin');
  let pointerX = 0;
  let pointerY = 0;
  let angleY = -.4;
  let angleX = .06;
  let targetY = angleY;
  let targetX = angleX;
  let lastTime = 0;

  // BoxGeometry uses +X, -X, +Y, -Y, +Z, -Z in this order.
  function faces(x, y, width, height, depth) {
    return [[x + depth + width, y + depth, depth, height], [x, y + depth, depth, height],
      [x + depth, y, width, depth], [x + depth + width, y, width, depth],
      [x + depth, y + depth, width, height], [x + 2 * depth + width, y + depth, width, height]];
  }

  function uvRect(face, textureHeight) {
    const [x, y, w, h] = face;
    return [x / 64, 1 - y / textureHeight, (x + w) / 64, 1 - y / textureHeight,
      x / 64, 1 - (y + h) / textureHeight, (x + w) / 64, 1 - (y + h) / textureHeight];
  }

  function makeLayers(image, pixels) {
    const height = image.height;
    const scale = image.width / 64;
    const textureHeight = height / scale;
    const slim = canvas.dataset.slim === 'true' || (canvas.dataset.slim === 'auto' && pixels[(20 * scale * image.width + 54 * scale) * 4 + 3] === 0);
    const arm = slim ? 3 : 4;
    const solid = new T.MeshLambertMaterial({ map: texture });
    const layer = new T.MeshLambertMaterial({ vertexColors: true });
    materials.add(solid);
    materials.add(layer);
    const modern = textureHeight >= 64;
    const parts = [
      { size: [8, 8, 8], position: [0, 10, 0], base: [0, 0], outer: [32, 0] },
      { size: [8, 12, 4], position: [0, 0, 0], base: [16, 16], outer: modern ? [16, 32] : null },
      { size: [arm, 12, 4], position: [-(4 + arm / 2), 0, 0], base: [40, 16], outer: modern ? [40, 32] : null },
      { size: [arm, 12, 4], position: [4 + arm / 2, 0, 0], base: modern ? [32, 48] : [40, 16], outer: modern ? [48, 48] : null, mirror: !modern },
      { size: [4, 12, 4], position: [-2, -12, 0], base: [0, 16], outer: modern ? [0, 32] : null },
      { size: [4, 12, 4], position: [2, -12, 0], base: modern ? [16, 48] : [0, 16], outer: modern ? [0, 48] : null, mirror: !modern }
    ];
    for (const part of parts) {
      const [w, h, d] = part.size;
      const mapping = faces(...part.base, w, h, d);
      const geometry = new T.BoxGeometry(w, h, d);
      geometry.setAttribute('uv', new T.Float32BufferAttribute(mapping.flatMap(face => uvRect(face, textureHeight)), 2));
      geometries.add(geometry);
      const mesh = new T.Mesh(geometry, solid);
      mesh.position.set(...part.position);
      if (part.mirror) mesh.scale.x = -1;
      model.add(mesh);
      if (!part.outer) continue;
      const positions = [], normals = [], colors = [];
      const cube = new T.BoxGeometry(1.02, 1.02, .45).toNonIndexed();
      const vertices = cube.getAttribute('position');
      const cubeNormals = cube.getAttribute('normal');
      const color = new T.Color();
      for (const [faceIndex, face] of faces(...part.outer, w, h, d).entries()) {
        const [tx, ty, fw, fh] = face;
        for (let py = 0; py < fh; py++) for (let px = 0; px < fw; px++) {
          const index = ((ty + py) * scale * image.width + (tx + px) * scale) * 4;
          if (pixels[index + 3] < 128) continue;
          color.setRGB(pixels[index] / 255, pixels[index + 1] / 255, pixels[index + 2] / 255).convertSRGBToLinear();
          const u = px + .5 - fw / 2, v = fh / 2 - py - .5;
          for (let j = 0; j < vertices.count; j++) {
            const x = vertices.getX(j) + u, y = vertices.getY(j) + v, z = vertices.getZ(j);
            const nx = cubeNormals.getX(j), ny = cubeNormals.getY(j), nz = cubeNormals.getZ(j);
            let position, normal;
            if (faceIndex === 0) { position = [w / 2 + .225 + z, y, -x]; normal = [nz, ny, -nx]; }
            if (faceIndex === 1) { position = [-w / 2 - .225 - z, y, x]; normal = [-nz, ny, nx]; }
            if (faceIndex === 2) { position = [x, h / 2 + .225 + z, -y]; normal = [nx, nz, -ny]; }
            if (faceIndex === 3) { position = [x, -h / 2 - .225 - z, y]; normal = [nx, -nz, ny]; }
            if (faceIndex === 4) { position = [x, y, d / 2 + .225 + z]; normal = [nx, ny, nz]; }
            if (faceIndex === 5) { position = [-x, y, -d / 2 - .225 - z]; normal = [-nx, ny, -nz]; }
            positions.push(...position);
            normals.push(...normal);
            colors.push(color.r, color.g, color.b);
          }
        }
      }
      cube.dispose();
      if (!positions.length) continue;
      const outerGeometry = new T.BufferGeometry();
      outerGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      outerGeometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      outerGeometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      outerGeometry.computeBoundingSphere();
      geometries.add(outerGeometry);
      const outer = new T.Mesh(outerGeometry, layer);
      outer.position.set(...part.position);
      model.add(outer);
    }
  }

  function draw(time) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .05) : 0;
    lastTime = time;
    const spinning = !paused && !dragging && !motion.matches;
    if (spinning) targetY += dt * .32;
    const moving = Math.abs(targetY - angleY) + Math.abs(targetX - angleX) > .001;
    const factor = motion.matches ? 1 : 1 - Math.exp(-14 * dt);
    angleY += (targetY - angleY) * factor;
    angleX += (targetX - angleX) * factor;
    model.rotation.set(angleX, angleY, 0);
    renderer.render(scene, camera);
    if ((spinning || moving) && !motion.matches) frame = requestAnimationFrame(draw);
  }
  function redraw() { if (!frame && visible && loaded && !document.hidden) frame = requestAnimationFrame(draw); }
  function stop() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  function updateSpinButton() {
    if (!spinButton) return;
    spinButton.disabled = motion.matches;
    spinButton.textContent = motion.matches ? 'Rotation off · reduced motion' : paused ? 'Start rotation' : 'Pause rotation';
    spinButton.setAttribute('aria-pressed', String(!paused && !motion.matches));
  }
  spinButton?.addEventListener('click', () => {
    paused = !paused;
    updateSpinButton();
    redraw();
  }, { signal });
  motion.addEventListener('change', () => { updateSpinButton(); stop(); redraw(); }, { signal });
  updateSpinButton();
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) redraw(); else stop();
  });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else redraw(); }, { signal });
  canvas.addEventListener('pointerdown', event => {
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    targetY += (event.clientX - pointerX) * .012;
    targetX = Math.max(-.8, Math.min(.8, targetX + (event.clientY - pointerY) * .009));
    pointerX = event.clientX;
    pointerY = event.clientY;
    redraw();
  }, { signal });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { dragging = false; redraw(); }, { signal });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    targetY += event.key === 'ArrowLeft' ? -.2 : event.key === 'ArrowRight' ? .2 : 0;
    targetX = Math.max(-.8, Math.min(.8, targetX + (event.key === 'ArrowUp' ? -.1 : event.key === 'ArrowDown' ? .1 : 0)));
    redraw();
  }, { signal });

  const loader = new T.TextureLoader();
  loader.setCrossOrigin('anonymous');
  function receive(tex) {
    if (disposed) { tex.dispose(); return; }
    const image = tex.image;
    if (![64, 128, 256, 512, 1024].includes(image.width) || (image.height !== image.width && image.height !== image.width / 2)) {
      tex.dispose(); fail(); return;
    }
    const sample = document.createElement('canvas');
    sample.width = image.width; sample.height = image.height;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    texture = tex;
    texture.magFilter = T.NearestFilter;
    texture.minFilter = T.NearestFilter;
    texture.generateMipmaps = false;
    texture.encoding = T.sRGBEncoding;
    try {
      makeLayers(image, ctx.getImageData(0, 0, image.width, image.height).data);
      loaded = true;
      redraw();
    } catch {
      canvas.closest('.plate').querySelector('.skin-hint').textContent = 'Skin preview unavailable';
      cleanup();
    }
  }
  let fallback = false;
  function fail() {
    if (disposed) return;
    if (!fallback && canvas.dataset.fallback) {
      fallback = true;
      loader.load(canvas.dataset.fallback, receive, undefined, fail);
    } else canvas.closest('.plate').querySelector('.skin-hint').textContent = 'Skin preview unavailable';
  }
  function cleanup() {
    stop();
    observer.disconnect();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    texture?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    disposed = true;
    delete canvas.dataset.live;
  }
  signal.addEventListener('abort', cleanup, { once: true });
  loader.load(`https://minotar.net/skin/${encodeURIComponent(canvas.dataset.username || 'Steve')}.png`, receive, undefined, fail);
};
