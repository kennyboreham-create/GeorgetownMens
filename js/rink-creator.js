(() => {
  const MAX_SCENES = 10;
  const SCENE_MS = 2000;
  const RINK_SRC = '/img/rink.png';
  const HIT_PAD = 0.028;
  const SAMPLE_MIN = 0.003;

  const state = {
    user: null,
    scenes: [[]],
    sceneIndex: 0,
    activeTool: null,
    rinkImg: null,
    dragging: null,
    lineDraft: null,
    playing: false,
    creating: false,
    playTimer: null,
    idSeq: 1,
    exportW: 1100,
    exportH: 520
  };

  const $ = (id) => document.getElementById(id);

  function setStatus(msg, kind) {
    const el = $('rcStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('ok', 'err');
    if (kind) el.classList.add(kind);
  }

  function canUseRinkCreator(user) {
    return user && (user.role === 'HEAD_COACH' || user.role === 'COACH');
  }

  function nextId() {
    return `obj_${state.idSeq++}`;
  }

  function cloneObjects(list) {
    return list.map((o) => {
      const copy = { ...o };
      if (Array.isArray(o.points)) {
        copy.points = o.points.map((p) => ({ x: p.x, y: p.y }));
      }
      return copy;
    });
  }

  function currentObjects() {
    return state.scenes[state.sceneIndex];
  }

  function updateSceneUi() {
    const total = state.scenes.length;
    const idx = state.sceneIndex + 1;
    $('rcSceneLabel').textContent = `Scene ${idx} / ${total}`;
    $('rcPrevScene').disabled = state.playing || state.sceneIndex <= 0;
    const atLast = state.sceneIndex >= total - 1;
    const atMax = total >= MAX_SCENES;
    $('rcNextScene').disabled = state.playing || (atLast && atMax);
    $('rcPlay').disabled = state.creating;
    $('rcCreate').disabled = state.playing || state.creating;
    $('rcClearScene').disabled = state.playing || state.creating;
  }

  function setActiveTool(tool) {
    if (state.playing || state.creating) return;
    state.activeTool = state.activeTool === tool ? null : tool;
    state.lineDraft = null;
    document.querySelectorAll('.rc-tool').forEach((btn) => {
      const on = btn.dataset.tool === state.activeTool;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    redraw();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
  }

  function canvasPoint(evt) {
    const canvas = $('rcCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / rect.width;
    const y = (evt.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y))
    };
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointNearSegment(p, a, b, pad) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) return dist(p, a) <= pad;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.min(1, Math.max(0, t));
    return dist(p, { x: a.x + t * dx, y: a.y + t * dy }) <= pad;
  }

  function pathLength(points) {
    if (!points || points.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < points.length; i += 1) {
      len += dist(points[i - 1], points[i]);
    }
    return len;
  }

  function pointNearPolyline(p, points, pad) {
    if (!points || points.length < 2) return false;
    for (let i = 1; i < points.length; i += 1) {
      if (pointNearSegment(p, points[i - 1], points[i], pad)) return true;
    }
    return false;
  }

  function lastDirectedSegment(points) {
    if (!points || points.length < 2) return null;
    const b = points[points.length - 1];
    for (let i = points.length - 2; i >= 0; i -= 1) {
      if (dist(points[i], b) > 0.006) {
        return { x1: points[i].x, y1: points[i].y, x2: b.x, y2: b.y };
      }
    }
    const a = points[0];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  function appendFreehandPoint(points, p, minDist) {
    if (!points.length) {
      points.push({ x: p.x, y: p.y });
      return;
    }
    if (points.length === 1) {
      points.push({ x: p.x, y: p.y });
      return;
    }
    const lastCommitted = points[points.length - 2];
    const last = points[points.length - 1];
    if (dist(lastCommitted, p) >= minDist) {
      if (dist(lastCommitted, last) < minDist * 0.4) {
        last.x = p.x;
        last.y = p.y;
      } else {
        points.push({ x: p.x, y: p.y });
      }
    } else {
      last.x = p.x;
      last.y = p.y;
    }
  }

  function strokePolyline(ctx, points, w, h) {
    if (!points || points.length < 2) return;
    const pts = points.map((pt) => ({ x: pt.x * w, y: pt.y * h }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i += 1) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }

  function hitTest(p) {
    const objs = currentObjects();
    for (let i = objs.length - 1; i >= 0; i -= 1) {
      const o = objs[i];
      if (o.type === 'line') {
        if (pointNearPolyline(p, o.points, HIT_PAD)) {
          return o;
        }
      } else if (dist(p, o) <= HIT_PAD) {
        return o;
      }
    }
    return null;
  }

  function drawArrowHead(ctx, x1, y1, x2, y2, size) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - size * Math.cos(angle - Math.PI / 7),
      y2 - size * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      x2 - size * Math.cos(angle + Math.PI / 7),
      y2 - size * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawObject(ctx, o, w, h) {
    const scale = Math.min(w, h);

    if (o.type === 'x') {
      const s = scale * 0.028;
      const x = o.x * w;
      const y = o.y * h;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(3, scale * 0.008);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();
      return;
    }

    if (o.type === 'o') {
      const r = scale * 0.026;
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = Math.max(5, scale * 0.012);
      ctx.beginPath();
      ctx.arc(o.x * w, o.y * h, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (o.type === 'puck') {
      const r = scale * 0.012;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(o.x * w, o.y * h, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = Math.max(1, scale * 0.002);
      ctx.stroke();
      return;
    }

    if (o.type === 'pylon') {
      const x = o.x * w;
      const y = o.y * h;
      const hw = scale * 0.016;
      const hh = scale * 0.028;
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#9a3412';
      ctx.lineWidth = Math.max(1, scale * 0.0025);
      ctx.beginPath();
      ctx.moveTo(x, y - hh);
      ctx.lineTo(x + hw, y + hh * 0.7);
      ctx.lineTo(x - hw, y + hh * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }

    if (o.type === 'line') {
      const pts = o.points;
      if (!pts || pts.length < 2) return;
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#0f172a';
      ctx.lineWidth = Math.max(3, scale * 0.007);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePolyline(ctx, pts, w, h);
      const seg = lastDirectedSegment(pts);
      if (seg) {
        drawArrowHead(ctx, seg.x1 * w, seg.y1 * h, seg.x2 * w, seg.y2 * h, scale * 0.028);
      }
    }
  }

  function paintFrame(ctx, objects, w, h, draft) {
    ctx.clearRect(0, 0, w, h);
    if (state.rinkImg) {
      ctx.drawImage(state.rinkImg, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#dbeafe';
      ctx.fillRect(0, 0, w, h);
    }
    objects.forEach((o) => drawObject(ctx, o, w, h));
    if (draft) drawObject(ctx, draft, w, h);
  }

  function redraw() {
    const canvas = $('rcCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    paintFrame(ctx, currentObjects(), canvas.width, canvas.height, state.lineDraft);
  }

  function placePointObject(type, p) {
    if (type === 'delete' || type === 'line') return;
    currentObjects().push({
      id: nextId(),
      type,
      x: p.x,
      y: p.y
    });
    redraw();
  }

  function removeObject(id) {
    const objs = currentObjects();
    const idx = objs.findIndex((o) => o.id === id);
    if (idx < 0) return false;
    objs.splice(idx, 1);
    redraw();
    setStatus('Object removed.', 'ok');
    return true;
  }

  function onPointerDown(evt) {
    if (state.playing || state.creating) return;
    if (evt.button !== 0) return;
    const canvas = $('rcCanvas');
    canvas.setPointerCapture?.(evt.pointerId);
    const p = canvasPoint(evt);

    if (state.activeTool === 'delete') {
      const hit = hitTest(p);
      if (hit) removeObject(hit.id);
      return;
    }

    if (state.activeTool === 'line') {
      state.lineDraft = {
        id: 'draft',
        type: 'line',
        points: [{ x: p.x, y: p.y }]
      };
      redraw();
      return;
    }

    const hit = hitTest(p);
    if (hit) {
      const origin = hit.type === 'line' && hit.points && hit.points.length
        ? hit.points[0]
        : hit;
      state.dragging = {
        id: hit.id,
        type: hit.type,
        offsetX: p.x - origin.x,
        offsetY: p.y - origin.y,
        originX: origin.x,
        originY: origin.y,
        startPoints: hit.points
          ? hit.points.map((pt) => ({ x: pt.x, y: pt.y }))
          : null
      };
      $('rcBoardWrap').classList.add('grabbing');
      return;
    }

    if (!state.activeTool) return;

    placePointObject(state.activeTool, p);
  }

  function onPointerMove(evt) {
    if (state.playing || state.creating) return;
    const p = canvasPoint(evt);

    if (state.dragging) {
      const obj = currentObjects().find((o) => o.id === state.dragging.id);
      if (!obj) return;
      if (obj.type === 'line' && state.dragging.startPoints) {
        const dx = (p.x - state.dragging.offsetX) - state.dragging.originX;
        const dy = (p.y - state.dragging.offsetY) - state.dragging.originY;
        obj.points = state.dragging.startPoints.map((pt) => ({
          x: clamp01(pt.x + dx),
          y: clamp01(pt.y + dy)
        }));
      } else {
        obj.x = clamp01(p.x - state.dragging.offsetX);
        obj.y = clamp01(p.y - state.dragging.offsetY);
      }
      redraw();
      return;
    }

    if (state.lineDraft) {
      appendFreehandPoint(state.lineDraft.points, p, SAMPLE_MIN);
      redraw();
    }
  }

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  function onPointerUp(evt) {
    if (state.playing || state.creating) return;
    const canvas = $('rcCanvas');
    try {
      canvas.releasePointerCapture?.(evt.pointerId);
    } catch (_) { /* ignore */ }

    if (state.dragging) {
      state.dragging = null;
      $('rcBoardWrap').classList.remove('grabbing');
      return;
    }

    if (state.lineDraft) {
      const d = state.lineDraft;
      state.lineDraft = null;
      const p = canvasPoint(evt);
      appendFreehandPoint(d.points, p, SAMPLE_MIN);
      if (pathLength(d.points) > 0.01) {
        currentObjects().push({
          id: nextId(),
          type: 'line',
          points: d.points.map((pt) => ({ x: pt.x, y: pt.y }))
        });
      }
      redraw();
    }
  }

  function onContextMenu(evt) {
    if (state.playing || state.creating) return;
    evt.preventDefault();
    const p = canvasPoint(evt);
    const hit = hitTest(p);
    if (hit) removeObject(hit.id);
  }

  function goPrevScene() {
    if (state.playing || state.sceneIndex <= 0) return;
    state.sceneIndex -= 1;
    state.lineDraft = null;
    state.dragging = null;
    updateSceneUi();
    redraw();
  }

  function goNextScene() {
    if (state.playing || state.creating) return;
    if (state.sceneIndex < state.scenes.length - 1) {
      state.sceneIndex += 1;
      state.lineDraft = null;
      state.dragging = null;
      updateSceneUi();
      redraw();
      return;
    }
    if (state.scenes.length >= MAX_SCENES) {
      setStatus(`Maximum of ${MAX_SCENES} scenes reached.`, 'err');
      updateSceneUi();
      return;
    }
    // Copy current scene into a new scene (deep copy). Scene N-1 stays unchanged.
    state.scenes.push(cloneObjects(currentObjects()));
    state.sceneIndex = state.scenes.length - 1;
    state.lineDraft = null;
    state.dragging = null;
    updateSceneUi();
    redraw();
    setStatus(`Scene ${state.sceneIndex + 1} created from a copy of the previous scene.`, 'ok');
  }

  function clearScene() {
    if (state.playing || state.creating) return;
    if (!currentObjects().length) return;
    if (!window.confirm('Clear all objects on this scene?')) return;
    state.scenes[state.sceneIndex] = [];
    state.lineDraft = null;
    redraw();
    setStatus('Scene cleared.', 'ok');
  }

  function stopPlay() {
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
    state.playing = false;
    $('rcBoardWrap').classList.remove('playing');
    $('rcPlay').textContent = 'Play';
    updateSceneUi();
    redraw();
  }

  function playPreview() {
    if (state.creating) return;
    if (state.playing) {
      stopPlay();
      setStatus('Preview stopped.', 'ok');
      return;
    }

    const hasContent = state.scenes.some((s) => s.length > 0);
    if (!hasContent) {
      setStatus('Add objects before previewing.', 'err');
      return;
    }

    state.playing = true;
    state.activeTool = null;
    document.querySelectorAll('.rc-tool').forEach((btn) => {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    });
    $('rcBoardWrap').classList.add('playing');
    $('rcPlay').textContent = 'Stop';
    updateSceneUi();
    setStatus('Playing once through all scenes (2s each)…', 'ok');

    let i = 0;
    const step = () => {
      if (!state.playing) return;
      state.sceneIndex = i;
      updateSceneUi();
      redraw();
      i += 1;
      if (i >= state.scenes.length) {
        state.playTimer = setTimeout(() => {
          stopPlay();
          setStatus('Preview finished (played once).', 'ok');
        }, SCENE_MS);
        return;
      }
      state.playTimer = setTimeout(step, SCENE_MS);
    };
    step();
  }

  function pickRecorderMime() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const type of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  function defaultTitle() {
    const d = new Date();
    const stamp = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    return `Rink play – ${stamp}`;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function createLibraryVideo() {
    if (state.playing || state.creating) return;

    const hasContent = state.scenes.some((s) => s.length > 0);
    if (!hasContent) {
      setStatus('Nothing to export — place objects or keep at least one non-empty scene.', 'err');
      window.alert('The board is empty. Add marks or lines before creating a video.');
      return;
    }

    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      setStatus('This browser cannot record canvas video (MediaRecorder / captureStream missing).', 'err');
      window.alert('Video export needs MediaRecorder support (Chrome or Firefox recommended).');
      return;
    }

    const mimeType = pickRecorderMime();
    if (!mimeType) {
      setStatus('No supported WebM mime type for MediaRecorder in this browser.', 'err');
      window.alert('This browser does not support WebM recording. Try Chrome or Firefox.');
      return;
    }

    const titleInput = window.prompt('Video title for the library:', defaultTitle());
    if (titleInput === null) return;
    const title = String(titleInput).trim() || defaultTitle();

    state.creating = true;
    updateSceneUi();
    setStatus('Rendering scenes to video…', 'ok');

    const exportW = state.exportW;
    const exportH = state.exportH;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const ctx = exportCanvas.getContext('2d');
    const stream = exportCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks = [];

    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder failed'));
      recorder.onstop = () => resolve();
    });

    try {
      recorder.start(200);

      for (let s = 0; s < state.scenes.length; s += 1) {
        setStatus(`Rendering scene ${s + 1} / ${state.scenes.length}…`, 'ok');
        const endAt = performance.now() + SCENE_MS;
        while (performance.now() < endAt) {
          paintFrame(ctx, state.scenes[s], exportW, exportH, null);
          await new Promise((r) => requestAnimationFrame(r));
        }
      }

      // Hold last frame briefly so encoder flushes cleanly
      paintFrame(ctx, state.scenes[state.scenes.length - 1], exportW, exportH, null);
      await wait(120);

      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      await stopped;

      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      if (!blob.size) {
        throw new Error('Recorded video was empty. Try again in Chrome or Firefox.');
      }

      setStatus('Uploading to Video Library…', 'ok');
      const file = new File([blob], 'rink-play.webm', { type: blob.type || 'video/webm' });
      await apiUploadVideoFile({
        file,
        title,
        tags: 'rink-creator, play'
      });
      setStatus(`Saved “${title}” to the Video Library.`, 'ok');
      window.alert(`Video created and uploaded.\n\nTitle: ${title}\nOpen Video Library to watch it.`);
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Create failed.', 'err');
      window.alert(err.message || 'Failed to create video.');
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch (_) { /* ignore */ }
      stream.getTracks().forEach((t) => t.stop());
    } finally {
      state.creating = false;
      updateSceneUi();
      redraw();
    }
  }

  function bindUi() {
    document.querySelectorAll('.rc-tool').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
    });
    $('rcPrevScene').addEventListener('click', goPrevScene);
    $('rcNextScene').addEventListener('click', goNextScene);
    $('rcClearScene').addEventListener('click', clearScene);
    $('rcPlay').addEventListener('click', playPreview);
    $('rcCreate').addEventListener('click', createLibraryVideo);

    const canvas = $('rcCanvas');
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
  }

  async function init() {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!userStr || !token) {
      window.location.href = '/login.html';
      return;
    }

    try {
      state.user = JSON.parse(userStr);
    } catch (_) {
      window.location.href = '/login.html';
      return;
    }

    if (!canUseRinkCreator(state.user)) {
      window.location.href = '/dashboard.html';
      return;
    }

    $('rcMain').classList.remove('hidden');
    bindUi();
    updateSceneUi();

    try {
      state.rinkImg = await loadImage(RINK_SRC);
      const ratio = state.rinkImg.naturalWidth / Math.max(1, state.rinkImg.naturalHeight);
      const canvas = $('rcCanvas');
      state.exportW = 1100;
      state.exportH = Math.max(1, Math.round(state.exportW / ratio));
      canvas.width = state.exportW;
      canvas.height = state.exportH;
      $('rcBoardWrap').style.aspectRatio = `${canvas.width} / ${canvas.height}`;
    } catch (err) {
      setStatus(err.message, 'err');
    }

    redraw();
    setStatus('Toggle a tool, then tap the rink to place. Drag the line tool freehand for a curve or a straight arrow. Drag objects to move. Use the eraser (or right-click) to delete. Next scene copies the current board.', 'ok');
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      SAMPLE_MIN,
      pathLength,
      appendFreehandPoint,
      pointNearPolyline,
      lastDirectedSegment,
      cloneObjects
    };
  }
})();
