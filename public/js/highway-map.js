'use strict';

(() => {
  const border = 3_750_000;
  const number = new Intl.NumberFormat('en-US');
  const colors = { paved: '#9B30FF', dug: '#FFA500', landmark: 'rgba(0, 255, 100, 0.75)', border: 'rgba(0, 123, 255, 0.3)' };
  const compactDistance = n => n >= 1e6 ? `${n / 1e6}m` : n >= 1e3 ? `${n / 1e3}k` : String(n);
  const roadLabels = { paved: '#ffffff', dug: '#FFA500', landmark: 'rgba(139, 255, 160, 0.73)' };
  const worldLimit = 30_000_000;
  const maxCanvasPixels = 3840 * 2160;
  const solid = [];
  const dugDash = [6, 5];
  const borderDash = [6, 4];
  const progressDash = [2, 4];
  const progressMarkerThreshold = 12;
  const square = r => [[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]];
  const diamond = r => [[0, -r], [r, 0], [0, r], [-r, 0], [0, -r]];
  const borders = [
    { radius: border, name: 'Overworld Border (3.75M)', path: square(border), dash: borderDash },
    { radius: worldLimit, name: 'Nether Border (30M)', path: square(worldLimit), dash: solid }
  ];

  function features({ axes, rings, diamonds, points, progress = [] }) {
    return [
      ...rings.map(([r, paved]) => ({ name: `Ring road · ${paved ? '' : 'dug'}${compactDistance(r)}`, x: r, z: -r, radius: r,
        kind: paved ? 'paved' : 'dug', path: square(r) })),
      ...diamonds.map(([r, paved]) => ({ name: `Diamond highway · ${paved ? '' : 'dug'}${compactDistance(r)}`, x: r, z: 0, radius: r,
        kind: paved ? 'paved' : 'dug', path: diamond(r) })),
      ...progress.map(([route, side, paved, from, to]) => {
        const [type, radiusText] = route.split('-');
        const r = Number(radiusText), isRing = type === 'ring';
        const vertices = isRing ? square(r) : diamond(r);
        const [ax, az] = vertices[side], [bx, bz] = vertices[side + 1];
        const point = offset => [ax + Math.sign(bx - ax) * offset, az + Math.sign(bz - az) * offset];
        const spacing = isRing ? r : r / 2;
        const runsBackward = to % spacing === 0 && from % spacing !== 0;
        const [startX, startZ] = point(runsBackward ? to : from), [x, z] = point(runsBackward ? from : to);
        const sideName = (isRing ? ['N', 'E', 'S', 'W'] : ['NE', 'SE', 'SW', 'NW'])[side];
        return { name: `${isRing ? 'Ring road' : 'Diamond highway'} · ${paved ? '' : 'dug'}${compactDistance(r)} · ${sideName} · WIP`,
          x, z, radius: r, kind: paved ? 'paved' : 'dug', progress: true, path: [[startX, startZ], [x, z]],
          midpoint: [(startX + x) / 2, (startZ + z) / 2], length: Math.hypot(x - startX, z - startZ) };
      }),
      ...axes.flatMap(([name, x, z, dx, dz]) => {
        const extendsPastPaving = dx !== undefined && (dx !== x || dz !== z);
        const paved = { name: `${name} highway`, label: extendsPastPaving ? '' : name, x, z, kind: 'paved', path: [[0, 0], [x, z]] };
        if (!extendsPastPaving) return [paved];
        return [paved, { name: `${name} dug extension`, label: name, x: dx, z: dz, kind: 'dug', path: [[x, z], [dx, dz]] }];
      }),
      ...points.map(([name, x, z]) => ({ name, label: name, x, z, kind: 'landmark' }))
    ];
  }

  function distance(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  }

  function clipSegment(x, y, dx, dy, width, height) {
    // Leave room for the stroke at the viewport edge.
    let first = 0, last = 1;
    for (const [start, delta, limit] of [[x, dx, width], [y, dy, height]]) {
      if (delta === 0) {
        if (start < -4 || start > limit + 4) return;
        continue;
      }
      const a = (-4 - start) / delta;
      const b = (limit + 4 - start) / delta;
      first = Math.max(first, Math.min(a, b));
      last = Math.min(last, Math.max(a, b));
      if (first >= last) return;
    }
    return [first, last];
  }

  window.thmHighwayMap = (canvas, data, signal) => {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas unavailable');
    const roads = features(data);
    const progressRoads = roads.filter(road => road.progress);
    const interactive = canvas.hasAttribute('data-interactive');
    const frame = canvas.closest('.atlas-frame');
    const position = frame?.querySelector('.atlas-position');
    let width, height, dpr, base, background, frameId, selected, hovered, movement;
    let needsPaint = true;
    let cx = 0, cz = 0, zoom = 1;
    let pointer;
    const extent = Math.max(border, ...roads.map(road => Math.max(Math.abs(road.x), Math.abs(road.z))));
    const range = Math.max(worldLimit, extent);
    const scale = () => base * zoom;
    const toX = x => width / 2 + (x - cx) * scale();
    const toY = z => height / 2 + (z - cz) * scale();
    const showMarker = road => road?.progress && road.length * scale() < progressMarkerThreshold;
    const worldX = x => cx + (x - width / 2) / scale();
    const worldZ = y => cz + (y - height / 2) / scale();
    const clamp = value => Math.min(range, Math.max(-range, value));
    const coordinate = value => number.format(Math.round(value) || 0);
    const coords = (x, z) => `X ${coordinate(x)} · Z ${coordinate(z)}`;
    const reducedMotion = interactive && matchMedia('(prefers-reduced-motion: reduce)');

    function dot(x, y, radius, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function strokePath(points, dash) {
      const dashLength = dash.length ? dash[0] + dash[1] : 0;
      ctx.setLineDash(dash);
      let x = toX(points[0][0]), y = toY(points[0][1]);
      let phase = 0, active = false;
      for (let i = 1; i < points.length; i++) {
        const nextX = toX(points[i][0]), nextY = toY(points[i][1]);
        const dx = nextX - x, dy = nextY - y;
        const length = dashLength ? Math.hypot(dx, dy) : 0;
        // Canvas lays out dashes along the entire input path before clipping.
        const visible = clipSegment(x, y, dx, dy, width, height);
        if (visible) {
          const [first, last] = visible;
          if (!active || first > 0) {
            if (active) ctx.stroke();
            ctx.beginPath();
            if (dashLength) ctx.lineDashOffset = (phase + first * length) % dashLength;
            ctx.moveTo(x + first * dx, y + first * dy);
          }
          ctx.lineTo(x + last * dx, y + last * dy);
          active = last === 1;
          if (!active) ctx.stroke();
        } else if (active) {
          ctx.stroke();
          active = false;
        }
        phase += length;
        x = nextX;
        y = nextY;
      }
      if (active) ctx.stroke();
      ctx.lineDashOffset = 0;
      ctx.setLineDash(solid);
    }

    function draw(now) {
      frameId = undefined;
      if (!base) return;
      if (movement) {
        const { start, fromX, fromZ, fromZoom, x, z, zoom: targetZoom } = movement;
        const progress = Math.max(0, Math.min(1, (now - start) / 180));
        const eased = 1 - (1 - progress) ** 3;
        cx = fromX + (x - fromX) * eased;
        cz = fromZ + (z - fromZ) * eased;
        // Reciprocal zoom keeps the world point beneath the cursor during easing.
        zoom = 1 / ((1 - eased) / fromZoom + eased / targetZoom);
        if (progress === 1) movement = undefined;
        else schedule();
        needsPaint = true;
      }
      if (position) {
        const x = pointer?.x ?? width / 2, y = pointer?.y ?? height / 2;
        position.textContent = `X ${coordinate(worldX(x))}  ·  Z ${coordinate(worldZ(y))}`;
      }
      if (!needsPaint) return;
      needsPaint = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!background) {
        background = ctx.createLinearGradient(0, 0, width, height);
        background.addColorStop(0, '#050505');
        background.addColorStop(.25, '#0a0a0a');
        background.addColorStop(.5, '#111111');
        background.addColorStop(.75, '#0f0f0f');
        background.addColorStop(1, '#1a1a1a');
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      const target = 70 / scale();
      const power = 10 ** Math.floor(Math.log10(target));
      const step = [1, 2, 5, 10].find(n => n * power >= target) * power;
      ctx.strokeStyle = '#2222228f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(worldX(0) / step) * step; x < worldX(width); x += step) {
        ctx.moveTo(toX(x), 0);
        ctx.lineTo(toX(x), height);
      }
      for (let z = Math.ceil(worldZ(0) / step) * step; z < worldZ(height); z += step) {
        ctx.moveTo(0, toY(z));
        ctx.lineTo(width, toY(z));
      }
      ctx.stroke();

      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 2;
      for (const { path, dash } of borders) strokePath(path, dash);

      function stroke(road) {
        if (!road.path || showMarker(road) || (!road.progress && road.radius * scale() < 2 && road !== selected)) return;
        ctx.strokeStyle = colors[road.kind];
        ctx.lineWidth = road === selected ? 4 : road === hovered ? 3 : road.radius ? 1.5 : 2;
        strokePath(road.path, road.progress ? progressDash : road.kind === 'dug' ? dugDash : solid);
      }

      for (const road of roads) if (road !== selected) stroke(road);
      if (selected) stroke(selected);

      dot(toX(0), toY(0), 4, '#FF6666');
      ctx.font = '600 12px Archivo, sans-serif';
      const labels = [[toX(0), toY(0)]];
      const marked = selected ? [selected, ...roads.filter(road => road !== selected)] : roads;
      for (const road of marked) {
        if (showMarker(road)) continue;
        if (road.label === undefined && road !== selected) continue;
        const x = toX(road.x), y = toY(road.z);
        if (x < 0 || x > width || y < 0 || y > height) continue;
        if (road !== selected && labels.some(([lx, ly]) => Math.abs(lx - x) < 32 && Math.abs(ly - y) < 18)) continue;
        const markerSize = road === selected ? 5 : 3;
        dot(x, y, markerSize, colors[road.kind]);
        if (road.kind === 'landmark') {
          ctx.beginPath();
          ctx.arc(x, y, markerSize + 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 255, 100, 0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (!road.label && road !== selected) continue;
        labels.push([x, y]);
        ctx.fillStyle = roadLabels[road.kind];
        ctx.textAlign = x > width / 2 ? 'right' : 'left';
        ctx.fillText(road.label || road.name, x + (x > width / 2 ? -8 : 8), y - 8);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#64b4ff';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 3;
      for (const { radius, name } of borders) {
        const left = toX(-radius), right = toX(radius);
        const top = toY(-radius), bottom = toY(radius);
        if (right < 0 || left > width || bottom < 0 || top > height) continue;
        const horizontal = [top, bottom].find(y => y > 24 && y < height - 22);
        const vertical = [left, right].find(x => x > 24 && x < width - 24);
        ctx.save();
        if (horizontal !== undefined) {
          const center = (Math.max(0, left) + Math.min(width, right)) / 2;
          const offset = radius === worldLimit && horizontal > 36 ? 20 : 7;
          ctx.translate(Math.max(86, Math.min(width - 86, center)), horizontal - offset);
        } else if (vertical !== undefined) {
          const center = (Math.max(0, top) + Math.min(height, bottom)) / 2;
          ctx.translate(vertical - 7, Math.max(86, Math.min(height - 86, center)));
          ctx.rotate(-Math.PI / 2);
        } else {
          ctx.restore();
          continue;
        }
        ctx.strokeText(name, 0, 0);
        ctx.fillText(name, 0, 0);
        ctx.restore();
      }

      for (const road of progressRoads) {
        if (!showMarker(road)) continue;
        const x = toX(road.x), y = toY(road.z);
        if (x < -7 || x > width + 7 || y < -7 || y > height + 7) continue;
        const size = road === selected || road === hovered ? 5 : 4;
        dot(x, y, size + 2, '#111111');
        dot(x, y, size, colors[road.kind]);
      }

      if (interactive) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#aaaaaa';
        const barUnits = step * scale() > width / 3 ? step / 2 : step;
        ctx.fillText(`${compactDistance(Math.round(barUnits))} blocks`, 16, height - 25);
        ctx.fillRect(16, height - 18, barUnits * scale(), 2);
      }
    }

    function schedule(paint = true) {
      needsPaint ||= paint;
      if (frameId === undefined) frameId = requestAnimationFrame(draw);
    }

    const resize = new ResizeObserver(([{ contentRect }]) => {
      width = contentRect.width;
      height = contentRect.height;
      if (!width || !height) return;
      base = Math.min(width, height) * .42 / extent;
      dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(maxCanvasPixels / (width * height)));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      background = undefined;
      schedule();
    });
    resize.observe(canvas);
    signal.addEventListener('abort', () => {
      resize.disconnect();
      cancelAnimationFrame(frameId);
    }, { once: true });

    if (!interactive) return;

    const scope = canvas.closest('.atlas');
    const select = scope.querySelector('[data-map-feature]');
    const detail = scope.querySelector('.atlas-detail');
    const controls = scope.querySelector('.atlas-controls');
    const progressLegend = scope.querySelector('.atlas-wip');
    if (progressLegend && data.progress?.length) progressLegend.hidden = false;
    const sorted = [...roads].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    sorted.forEach((road, index) => {
      const name = road.progress ? `${road.name} · ${coords(road.x, road.z)}` : road.name;
      select.add(new Option(name, String(index)));
    });

    function inspect(road) {
      selected = road;
      select.value = road ? String(sorted.indexOf(road)) : '';
      if (!road) {
        detail.textContent = 'Select a road or landmark for details.';
      } else {
        const title = document.createElement('strong');
        title.textContent = road.name;
        const fields = [road.progress ? 'Work in progress' : road.kind === 'paved' ? 'Paved' : road.kind === 'dug' ? 'Dug' : 'Landmark'];
        if (road.path) {
          let length = 0;
          for (let i = 1; i < road.path.length; i++) {
            length += Math.hypot(road.path[i][0] - road.path[i - 1][0], road.path[i][1] - road.path[i - 1][1]);
          }
          fields.push(`${coordinate(length)} blocks`);
          if (road.radius) fields.push(`Radius ${coordinate(road.radius)} blocks`);
          if (!road.radius || road.progress) fields.push(`Start ${coords(...road.path[0])}`, `End ${coords(road.x, road.z)}`);
        } else fields.push(coords(road.x, road.z));
        detail.replaceChildren(title, ...fields.map(text => {
          const field = document.createElement('span');
          field.textContent = text;
          return field;
        }));
      }
      schedule();
    }

    function moveTo(x, z, nextZoom, animate = true) {
      if (hovered) {
        hovered = undefined;
        canvas.classList.remove('has-feature');
      }
      if (animate && !reducedMotion.matches) {
        movement = { start: performance.now(), fromX: cx, fromZ: cz, fromZoom: zoom, x, z, zoom: nextZoom };
      } else {
        movement = undefined;
        cx = x;
        cz = z;
        zoom = nextZoom;
      }
      schedule();
    }

    const boundedZoom = target => Math.min(Math.max(1, .5 / base), Math.max(.14, target));

    function focusRoad(road) {
      if (road.progress) {
        const nextZoom = Math.min(width, height) * .62 / (base * road.length);
        moveTo(...road.midpoint, boundedZoom(nextZoom));
      } else if (road.radius) {
        moveTo(0, 0, boundedZoom(extent / road.radius));
      } else {
        moveTo(road.x, road.z, boundedZoom(Math.max(1, extent / 160_000)));
      }
    }

    function changeZoom(factor, x = width / 2, y = height / 2, animate = true) {
      const targetZoom = (movement?.zoom ?? zoom) * factor;
      const nextZoom = boundedZoom(targetZoom);
      if (nextZoom === (movement?.zoom ?? zoom)) return;
      moveTo(clamp(worldX(x) - (x - width / 2) / (base * nextZoom)),
        clamp(worldZ(y) - (y - height / 2) / (base * nextZoom)), nextZoom, animate);
    }

    function pan(dx, dy) {
      moveTo(clamp(cx - dx / scale()), clamp(cz - dy / scale()), zoom, false);
    }

    function action(name) {
      if (!base) return;
      if (name === 'reset') {
        moveTo(0, 0, 1);
        inspect(undefined);
      } else if (name === 'in' || name === 'out') {
        changeZoom(name === 'in' ? 1.6 : 1 / 1.6);
      } else {
        openActions(width / 2, height / 2);
      }
    }

    controls.addEventListener('click', event => {
      const name = event.target.dataset.mapAction;
      if (name) action(name);
    }, { signal });
    select.addEventListener('change', () => {
      const road = select.value === '' ? undefined : sorted[Number(select.value)];
      if (road && base) focusRoad(road);
      inspect(road);
    }, { signal });

    canvas.addEventListener('keydown', event => {
      if (!base) return;
      switch (event.key) {
        case 'ArrowLeft': pan(60, 0); break;
        case 'ArrowRight': pan(-60, 0); break;
        case 'ArrowUp': pan(0, 60); break;
        case 'ArrowDown': pan(0, -60); break;
        case '+': case '=': action('in'); break;
        case '−': case '-': action('out'); break;
        case '0': case 'Home': action('reset'); break;
        case 'ContextMenu': action('more'); break;
        case 'F10': if (!event.shiftKey) return; action('more'); break;
        default: return;
      }
      event.preventDefault();
    }, { signal });

    const pointers = new Map();
    let dragged = false;
    function local(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function hit(x, y) {
      const wx = worldX(x), wz = worldZ(y);
      let marker, markerDistance = 8;
      for (const road of progressRoads) {
        if (!showMarker(road)) continue;
        const d = Math.hypot(x - toX(road.x), y - toY(road.z));
        if (d <= markerDistance) { marker = road; markerDistance = d; }
      }
      if (marker) return marker;
      let closest, best = 12 / scale();
      for (const road of roads) {
        if (showMarker(road) || (!road.progress && road.radius * scale() < 2)) continue;
        const d = road.path ? Math.min(...road.path.slice(1).map(([bx, bz], index) =>
          distance(wx, wz, ...road.path[index], bx, bz))) : Math.hypot(wx - road.x, wz - road.z);
        if (d <= best) { closest = road; best = d; }
      }
      return closest;
    }

    const more = document.createElement('button');
    more.type = 'button';
    more.dataset.mapAction = 'more';
    more.setAttribute('aria-label', 'Map actions');
    more.setAttribute('aria-expanded', 'false');
    more.textContent = '⋯';
    controls.append(more);
    const actions = document.createElement('div');
    actions.className = 'atlas-actions';
    actions.hidden = true;
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Map actions');
    const locationLabel = document.createElement('p');
    const copy = document.createElement('button');
    const center = document.createElement('button');
    copy.type = center.type = 'button';
    center.textContent = 'Center here';
    actions.append(locationLabel, copy, center);
    frame.append(actions);
    let actionPoint;

    function closeActions(restoreFocus) {
      if (actions.hidden) return;
      actions.hidden = true;
      more.setAttribute('aria-expanded', 'false');
      if (restoreFocus) canvas.focus({ preventScroll: true });
    }

    function openActions(x, y, inspectAtPoint = false) {
      movement = undefined;
      actionPoint = { x: worldX(x), z: worldZ(y) };
      const road = inspectAtPoint && hit(x, y);
      if (road) inspect(road);
      locationLabel.textContent = coords(actionPoint.x, actionPoint.z);
      copy.textContent = 'Copy coordinates';
      actions.hidden = false;
      more.setAttribute('aria-expanded', 'true');
      actions.style.left = `${Math.max(4, Math.min(x, width - actions.offsetWidth - 4))}px`;
      actions.style.top = `${Math.max(4, Math.min(y, height - actions.offsetHeight - 4))}px`;
      copy.focus({ preventScroll: true });
    }

    copy.addEventListener('click', async () => {
      const point = actionPoint;
      try {
        await navigator.clipboard.writeText(`${Math.round(point.x) || 0} ${Math.round(point.z) || 0}`);
        if (actionPoint === point) copy.textContent = 'Copied';
      } catch {
        if (actionPoint === point) copy.textContent = 'Clipboard unavailable';
      }
    }, { signal });
    center.addEventListener('click', () => {
      pointer = undefined;
      moveTo(clamp(actionPoint.x), clamp(actionPoint.z), zoom);
      closeActions(true);
    }, { signal });
    actions.addEventListener('focusout', event => {
      if (!actions.contains(event.relatedTarget)) closeActions(false);
    }, { signal });
    actions.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActions(true);
      }
    }, { signal });
    document.addEventListener('pointerdown', event => {
      if (!actions.contains(event.target) && event.target !== more) closeActions(false);
    }, { signal });
    canvas.addEventListener('contextmenu', event => {
      if (!base) return;
      event.preventDefault();
      const { x, y } = local(event);
      openActions(x, y, true);
    }, { signal });

    canvas.addEventListener('wheel', event => {
      if (!base || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      closeActions(false);
      const point = local(event);
      if (!pointer || Math.hypot(pointer.x - point.x, pointer.y - point.y) > 1) pointer = point;
      const { x, y } = pointer;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      changeZoom(Math.exp(-Math.max(-300, Math.min(300, delta)) * .0025), x, y);
    }, { signal, passive: false });
    canvas.addEventListener('pointerdown', event => {
      if (!base || event.button !== 0 || pointers.size >= 2) return;
      dragged = pointers.size > 0;
      movement = undefined;
      pointers.set(event.pointerId, local(event));
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      const next = local(event);
      pointer = next;
      const previous = pointers.get(event.pointerId);
      if (previous) {
        const dx = next.x - previous.x, dy = next.y - previous.y;
        if (!dragged && Math.hypot(dx, dy) < 4) return;
        dragged = true;
        if (pointers.size === 2) {
          const other = [...pointers.values()].find(point => point !== previous);
          pan(dx / 2, dy / 2);
          const before = Math.hypot(previous.x - other.x, previous.y - other.y);
          const after = Math.hypot(next.x - other.x, next.y - other.y);
          if (before && after) changeZoom(after / before, (next.x + other.x) / 2, (next.y + other.y) / 2, false);
        } else pan(dx, dy);
        pointers.set(event.pointerId, next);
      } else if (base && event.pointerType === 'mouse') {
        const road = hit(next.x, next.y);
        if (road !== hovered) {
          hovered = road;
          canvas.classList.toggle('has-feature', Boolean(road));
          schedule();
        }
      }
      schedule(false);
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, event => {
        if (!pointers.delete(event.pointerId)) return;
        if (pointers.size === 0) {
          canvas.classList.remove('is-dragging');
          if (type === 'pointerup' && !dragged) {
            const { x, y } = local(event);
            const road = hit(x, y);
            if (showMarker(road)) focusRoad(road);
            inspect(road);
          }
        }
      }, { signal });
    }
    canvas.addEventListener('pointerleave', () => {
      pointer = undefined;
      schedule(Boolean(hovered));
      hovered = undefined;
      canvas.classList.remove('has-feature');
    }, { signal });
    controls.hidden = false;
    select.closest('label').hidden = false;
    select.disabled = false;
    scope.querySelector('.atlas-status').hidden = true;
  };
})();
