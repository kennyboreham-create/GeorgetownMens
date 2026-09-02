let mediaElement = null;
let activeTags = [];
let currentParentVideoId = null;
let currentVideoTitle = '';
let libraryVideosCache = [];
let recorders = [
  { isRecording: false, startTime: 0, pausedAt: null },
  { isRecording: false, startTime: 0, pausedAt: null },
  { isRecording: false, startTime: 0, pausedAt: null }
];

const OVERLAY_DISPLAY_MS = 5000;
const overlayRemovalTimers = new WeakMap();

/** Active drag-to-place session (window-level pointer + touch listeners). */
let activeDragPlacement = null;

const DRAG_LISTENER_OPTS = { capture: true, passive: false };

/** Mutes source video / snippet recordings only — does not affect speechSynthesis. */
let videoAudioMuted = false;
let overlayRecordLog = [];

const SPEAKER_ICON_HTML = `
  <span class="video-overlay-speaker-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  </span>
`;

document.addEventListener('DOMContentLoaded', () => {
  mediaElement = document.getElementById('mainVideoPlayer');
  mediaElement?.addEventListener('play', applyVideoMuteState);
  initOverlayToolbar();
  document.addEventListener('keydown', handleSnippetHotkeys);
});

function handleSnippetHotkeys(e) {
  if (!isVideoEditorOpen()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  if (e.key === '1') {
    e.preventDefault();
    playVideo();
  } else if (e.key === '2') {
    e.preventDefault();
    stopVideo();
  } else if (e.key === '3') {
    e.preventDefault();
    toggleRecord(0);
  } else if (e.key === '4') {
    e.preventDefault();
    toggleRecord(1);
  } else if (e.key === '5') {
    e.preventDefault();
    toggleRecord(2);
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('snippetToast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-semibold transition-opacity duration-300 ${
    type === 'error' ? 'bg-red-900/90 text-red-100 border border-red-700' : 'bg-emerald-900/90 text-emerald-100 border border-emerald-700'
  }`;

  toast.classList.remove('hidden', 'opacity-0');

  clearTimeout(showToast._hideTimer);
  showToast._hideTimer = setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2000);
}

function isSnippetBrowsableUpload(v) {
  if (!hasStoredVideoFile(v)) return false;
  if (v.mimeType === 'video/youtube') return false;
  if (typeof isYouTubeUrl === 'function' && isYouTubeUrl(v.url)) return false;
  return true;
}

async function openVideoBrowser() {
  const modal = document.getElementById('videoBrowserModal');
  const list = document.getElementById('videoBrowserList');
  modal.classList.remove('hidden');
  list.innerHTML = '<p class="text-slate-400 text-sm italic">Loading videos...</p>';

  try {
    const videos = await apiFetch('/videos?fullOnly=1&uploadOnly=1');
    // File-backed uploads only, newest first (server sorts by createdAt desc; re-sort for safety)
    const uploads = (Array.isArray(videos) ? videos : [])
      .filter(isSnippetBrowsableUpload)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    libraryVideosCache = uploads;

    if (!uploads.length) {
      list.innerHTML = '<p class="text-slate-400 text-sm italic">No uploaded videos yet. Upload one from the Video Library tab.</p>';
      return;
    }

    list.innerHTML = uploads.map(v => `
      <button type="button" onclick="selectLibraryVideo('${v._id}')"
        class="w-full text-left bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg p-3 transition">
        <p class="font-semibold text-blue-400">${escapeHtml(v.title)}</p>
        <p class="text-xs text-slate-400 mt-1">${escapeHtml(v.originalFilename || 'Stored video')} · ${new Date(v.createdAt).toLocaleDateString()}</p>
        ${v.tags && v.tags.length ? `<div class="flex flex-wrap gap-1 mt-2">${v.tags.map(t => `<span class="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </button>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p class="text-red-400 text-sm">${escapeHtml(err.message)}</p>`;
  }
}

function closeVideoBrowser() {
  document.getElementById('videoBrowserModal').classList.add('hidden');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectLibraryVideo(videoId) {
  const video = libraryVideosCache.find(v => v._id === videoId);
  if (!video) return;
  currentParentVideoId = video._id;
  currentVideoTitle = video.title;
  overlayRecordLog = [];
  clearSnippetTitleInput();

  if (isYouTubeUrl(video.url) && !hasStoredVideoFile(video)) {
    showToast('YouTube videos cannot be opened in the snippet studio. Use Preview from the library instead.', 'error');
    return;
  }

  if (hasStoredVideoFile(video) || (video.url && video.url.includes('/stream'))) {
    mediaElement.src = getVideoStreamUrl(video._id);
  } else if (video.url && /^https?:\/\//i.test(video.url)) {
    mediaElement.src = video.url;
  } else {
    showToast('This video cannot be played in the snippet studio.', 'error');
    return;
  }

  document.getElementById('currentVideoTitle').textContent = video.title;
  document.getElementById('fileSelector').classList.add('hidden');
  document.getElementById('videoEditor').classList.remove('hidden');
  applyVideoMuteState();
  syncOverlayLayerSize();
  closeVideoBrowser();
}

function closeCurrentVideo() {
  if (!mediaElement) return;

  cancelOverlayDrag();
  mediaElement.pause();
  mediaElement.removeAttribute('src');
  mediaElement.load();

  currentParentVideoId = null;
  currentVideoTitle = '';
  overlayRecordLog = [];
  clearSnippetTitleInput();
  resetRecorders();
  clearAllOverlays();

  document.getElementById('videoEditor').classList.add('hidden');
  document.getElementById('fileSelector').classList.remove('hidden');
}

function resetRecorders() {
  recorders = [
    { isRecording: false, startTime: 0, pausedAt: null },
    { isRecording: false, startTime: 0, pausedAt: null },
    { isRecording: false, startTime: 0, pausedAt: null }
  ];

  [1, 2, 3].forEach((num) => {
    const btn = document.getElementById(`btnRec${num}`);
    if (!btn) return;
    btn.classList.remove('bg-red-600', 'animate-pulse');
    btn.classList.add('bg-slate-700');
    btn.innerText = `${num + 2} - Rec ${num}`;
  });
}

function playVideo() {
  if (!mediaElement) return;
  mediaElement.play();
  recorders.forEach((r) => {
    if (r.isRecording && r.pausedAt) {
      r.startTime += (mediaElement.currentTime - r.pausedAt);
      r.pausedAt = null;
    }
  });
}

function stopVideo() {
  if (!mediaElement) return;
  mediaElement.pause();
  recorders.forEach((r) => {
    if (r.isRecording) {
      r.pausedAt = mediaElement.currentTime;
    }
  });
}

async function toggleRecord(index) {
  const btn = document.getElementById(`btnRec${index + 1}`);
  const slot = recorders[index];

  if (!slot.isRecording) {
    slot.isRecording = true;
    slot.startTime = mediaElement.currentTime;
    btn.classList.remove('bg-slate-700');
    btn.classList.add('bg-red-600', 'animate-pulse');
    btn.innerText = `Stop Rec ${index + 1}`;
  } else {
    slot.isRecording = false;
    const endTime = mediaElement.currentTime;
    btn.classList.remove('bg-red-600', 'animate-pulse');
    btn.classList.add('bg-slate-700');
    btn.innerText = `${index + 3} - Rec ${index + 1}`;

    await saveSnippetToDB(slot.startTime, endTime);
  }
}

function addGlobalTag() {
  const tagInput = document.getElementById('quickTagInput');
  const tagVal = tagInput.value.trim();
  if (!tagVal) return;

  tagVal.split(',').map(t => t.trim()).filter(Boolean).forEach((tag) => {
    if (!activeTags.includes(tag)) {
      activeTags.push(tag);
    }
  });

  tagInput.value = '';
  renderTags();
}

function collectTagsForSave() {
  addGlobalTag();
  return [...activeTags];
}

function renderTags() {
  const container = document.getElementById('activeTagsContainer');
  container.innerHTML = activeTags.map(t => `
    <span class="bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 text-xs px-2 py-1 rounded-full">${escapeHtml(t)}</span>
  `).join('');
}

function getOverlayLayer() {
  return document.getElementById('videoOverlayLayer');
}

function getDropHitTarget() {
  const container = getVideoContainer();
  const video = mediaElement || document.getElementById('mainVideoPlayer');
  const layer = getOverlayLayer();
  const containerRect = container?.getBoundingClientRect();
  if (containerRect && containerRect.width > 1 && containerRect.height > 1) {
    return container;
  }
  const videoRect = video?.getBoundingClientRect();
  if (videoRect && videoRect.width > 1 && videoRect.height > 1) {
    return video;
  }
  return layer;
}

function syncOverlayLayerSize() {
  const layer = getOverlayLayer();
  const container = getVideoContainer();
  if (!layer || !container) return;
  const box = container.getBoundingClientRect();
  layer.style.position = 'absolute';
  layer.style.left = '0px';
  layer.style.top = '0px';
  layer.style.right = 'auto';
  layer.style.bottom = 'auto';
  layer.style.width = box.width > 1 ? `${box.width}px` : '100%';
  layer.style.height = box.height > 1 ? `${box.height}px` : '100%';
  layer.style.zIndex = '5';
  layer.style.pointerEvents = 'none';
}

function getVideoContainer() {
  return document.getElementById('videoContainer');
}

function isVideoEditorOpen() {
  const editor = document.getElementById('videoEditor');
  return editor && !editor.classList.contains('hidden');
}

function applyVideoMuteState() {
  if (!mediaElement) return;
  mediaElement.muted = videoAudioMuted;
}

function updateMuteButtonUi() {
  const btn = document.getElementById('btnMuteVideo');
  if (!btn) return;
  if (videoAudioMuted) {
    btn.textContent = 'Sound Off';
    btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'border-slate-500');
    btn.classList.add('bg-rose-700', 'hover:bg-rose-600', 'border-rose-500');
  } else {
    btn.textContent = 'Mute Video';
    btn.classList.add('bg-slate-700', 'hover:bg-slate-600', 'border-slate-500');
    btn.classList.remove('bg-rose-700', 'hover:bg-rose-600', 'border-rose-500');
  }
}

function toggleVideoMute() {
  videoAudioMuted = !videoAudioMuted;
  applyVideoMuteState();
  updateMuteButtonUi();
  showToast(videoAudioMuted
    ? 'Video muted — snippets save without game audio. Speaker still works.'
    : 'Video sound on');
}

/**
 * Stream used if a snippet is captured with MediaRecorder / captureStream.
 * When muted, omit source-video audio tracks. Never ties into speechSynthesis.
 */
function getSnippetCaptureStream(frameRate = 30) {
  if (!mediaElement || typeof mediaElement.captureStream !== 'function') return null;

  const raw = mediaElement.captureStream(frameRate);
  if (!videoAudioMuted) return raw;

  const videoOnly = new MediaStream();
  raw.getVideoTracks().forEach((track) => videoOnly.addTrack(track));
  return videoOnly;
}

function getEventClientPoint(e) {
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    return { x: e.clientX, y: e.clientY };
  }
  return null;
}

function isPrimaryDragStart(e) {
  if (e.type === 'touchstart') return true;
  if (e.pointerType && e.pointerType !== 'mouse') return true;
  return e.button === 0 || e.button == null;
}

function preventNativeDrag(el) {
  el.setAttribute('draggable', 'false');
  el.addEventListener('dragstart', (e) => e.preventDefault());
}

function attachWindowDragListeners(session) {
  window.addEventListener('pointermove', session.onPointerMove, DRAG_LISTENER_OPTS);
  window.addEventListener('pointerup', session.onPointerUp, DRAG_LISTENER_OPTS);
  window.addEventListener('pointercancel', session.onPointerCancel, DRAG_LISTENER_OPTS);
  window.addEventListener('touchmove', session.onTouchMove, DRAG_LISTENER_OPTS);
  window.addEventListener('touchend', session.onTouchEnd, DRAG_LISTENER_OPTS);
  window.addEventListener('touchcancel', session.onTouchCancel, DRAG_LISTENER_OPTS);
}

function detachWindowDragListeners(session) {
  if (!session) return;
  window.removeEventListener('pointermove', session.onPointerMove, DRAG_LISTENER_OPTS);
  window.removeEventListener('pointerup', session.onPointerUp, DRAG_LISTENER_OPTS);
  window.removeEventListener('pointercancel', session.onPointerCancel, DRAG_LISTENER_OPTS);
  window.removeEventListener('touchmove', session.onTouchMove, DRAG_LISTENER_OPTS);
  window.removeEventListener('touchend', session.onTouchEnd, DRAG_LISTENER_OPTS);
  window.removeEventListener('touchcancel', session.onTouchCancel, DRAG_LISTENER_OPTS);
}

function setOverlayDragging(active) {
  document.body.classList.toggle('overlay-dragging', !!active);
}

function bindOverlayToolPointer(btnId, resolvePayload) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  preventNativeDrag(btn);

  const beginFromEvent = (e) => {
    if (activeDragPlacement) return;
    if (!isPrimaryDragStart(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const payload = resolvePayload();
    if (!payload) return;
    const point = getEventClientPoint(e);
    if (!point) return;
    startOverlayDrag(point, payload.type, payload.text);
  };

  btn.addEventListener('pointerdown', beginFromEvent, DRAG_LISTENER_OPTS);
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    beginFromEvent(e);
  }, DRAG_LISTENER_OPTS);
}

function initOverlayToolbar() {
  bindOverlayToolPointer('btnAddArrow', () => ({ type: 'arrow' }));
  bindOverlayToolPointer('btnPlaceSpeak', () => {
    const text = document.getElementById('speakerTextInput')?.value.trim();
    if (!text) {
      showToast('Enter text to speak first.', 'error');
      return null;
    }
    return { type: 'speaker', text };
  });

  document.getElementById('cancelSpeakerBtn')?.addEventListener('click', cancelOverlayDrag);
  document.getElementById('btnMuteVideo')?.addEventListener('click', toggleVideoMute);
  updateMuteButtonUi();
}

function createGhostElement(type, text) {
  const ghost = document.createElement('div');
  ghost.className = 'overlay-drag-ghost';

  if (type === 'arrow') {
    ghost.classList.add('video-overlay-arrow');
    ghost.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 56 L56 8 M56 8 H28 M56 8 V36" stroke="#fbbf24" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 56 L56 8 M56 8 H28 M56 8 V36" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  } else if (type === 'text') {
    ghost.classList.add('video-overlay-text');
    ghost.textContent = 'Text';
  } else if (type === 'speaker') {
    ghost.style.width = '28px';
    ghost.style.height = '28px';
    ghost.style.opacity = '0';
    ghost.setAttribute('aria-hidden', 'true');
  }

  return ghost;
}

function positionGhostAt(clientX, clientY) {
  if (!activeDragPlacement?.ghost) return;
  const ghost = activeDragPlacement.ghost;
  const w = ghost.offsetWidth || 72;
  const h = ghost.offsetHeight || 40;
  ghost.style.left = `${clientX - w / 2}px`;
  ghost.style.top = `${clientY - h / 2}px`;
}

function isPointInRect(clientX, clientY, el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right
    && clientY >= rect.top && clientY <= rect.bottom;
}

function startOverlayDrag(point, type, text) {
  if (!isVideoEditorOpen()) {
    showToast('Open a video before adding overlays.', 'error');
    return;
  }

  cancelOverlayDrag();

  const ghost = createGhostElement(type, text);
  document.body.appendChild(ghost);

  const session = {
    type,
    text,
    ghost,
    lastX: point.x,
    lastY: point.y,
    ended: false,
    endTimer: null,
    onPointerMove: (ev) => {
      ev.preventDefault();
      onOverlayDragMove(ev);
    },
    onPointerUp: (ev) => {
      ev.preventDefault();
      if (ev.pointerType === 'touch') {
        clearTimeout(session.endTimer);
        session.endTimer = setTimeout(() => onOverlayDragEnd(ev), 50);
        return;
      }
      onOverlayDragEnd(ev);
    },
    onPointerCancel: (ev) => {
      /* iOS often cancels pointer events when the finger leaves a button.
         Keep the session alive; touchmove/touchend continue the drag. */
      ev.preventDefault();
    },
    onTouchMove: (ev) => {
      ev.preventDefault();
      onOverlayDragMove(ev);
    },
    onTouchEnd: (ev) => {
      ev.preventDefault();
      clearTimeout(session.endTimer);
      onOverlayDragEnd(ev);
    },
    onTouchCancel: (ev) => {
      ev.preventDefault();
      clearTimeout(session.endTimer);
      cancelOverlayDrag();
    }
  };

  activeDragPlacement = session;
  attachWindowDragListeners(session);
  setOverlayDragging(true);

  positionGhostAt(point.x, point.y);
  showToast('Drag onto the video, then release to place');

  if (type === 'speaker') {
    document.getElementById('cancelSpeakerBtn')?.classList.remove('hidden');
  }
}

function onOverlayDragMove(e) {
  if (!activeDragPlacement) return;
  const point = getEventClientPoint(e);
  if (!point) return;
  activeDragPlacement.lastX = point.x;
  activeDragPlacement.lastY = point.y;
  positionGhostAt(point.x, point.y);
}

function detachOverlayDragListeners() {
  if (!activeDragPlacement) return;
  detachWindowDragListeners(activeDragPlacement);
  setOverlayDragging(false);
}

function onOverlayDragEnd(e) {
  if (!activeDragPlacement || activeDragPlacement.ended) return;
  activeDragPlacement.ended = true;

  const fromEvent = getEventClientPoint(e);
  if (fromEvent && (e.type === 'touchend' || e.pointerType !== 'touch')) {
    activeDragPlacement.lastX = fromEvent.x;
    activeDragPlacement.lastY = fromEvent.y;
  }
  const point = {
    x: activeDragPlacement.lastX,
    y: activeDragPlacement.lastY
  };
  clearTimeout(activeDragPlacement.endTimer);
  const { type, text, ghost } = activeDragPlacement;
  detachOverlayDragListeners();
  ghost.remove();
  activeDragPlacement = null;
  document.getElementById('cancelSpeakerBtn')?.classList.add('hidden');

  syncOverlayLayerSize();
  const layer = getOverlayLayer();
  const dropTarget = (layer && layer.clientWidth > 1) ? layer : getDropHitTarget();
  const rect = dropTarget ? dropTarget.getBoundingClientRect() : null;
  const inRect = !!(dropTarget && isPointInRect(point.x, point.y, dropTarget));
  if (inRect) {
    const x = point.x - rect.left;
    const y = point.y - rect.top;
    finalizeOverlayPlacement(type, x, y, text);
  }
}

function cancelOverlayDrag() {
  if (!activeDragPlacement) {
    document.getElementById('cancelSpeakerBtn')?.classList.add('hidden');
    setOverlayDragging(false);
    return;
  }
  activeDragPlacement.ended = true;
  clearTimeout(activeDragPlacement.endTimer);
  if (activeDragPlacement.ghost) {
    activeDragPlacement.ghost.remove();
  }
  detachOverlayDragListeners();
  activeDragPlacement = null;
  document.getElementById('cancelSpeakerBtn')?.classList.add('hidden');
}

function cancelSpeakerPlacement() {
  cancelOverlayDrag();
}

function finalizeOverlayPlacement(type, x, y, text) {
  if (type === 'arrow') {
    const arrow = document.createElement('div');
    arrow.className = 'video-overlay-arrow';
    arrow.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 56 L56 8 M56 8 H28 M56 8 V36" stroke="#fbbf24" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 56 L56 8 M56 8 H28 M56 8 V36" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    addOverlayElement(arrow, { x, y, overlayType: 'arrow' });
  } else if (type === 'text') {
    const textEl = document.createElement('div');
    textEl.className = 'video-overlay-text';
    textEl.contentEditable = 'true';
    textEl.textContent = 'Text';
    textEl.spellcheck = false;

    textEl.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      textEl.focus();
      const range = document.createRange();
      range.selectNodeContents(textEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    textEl.addEventListener('focus', () => {
      textEl.dataset.editing = 'true';
      textEl.classList.add('is-editing');
    });

    textEl.addEventListener('blur', () => {
      delete textEl.dataset.editing;
      textEl.classList.remove('is-editing');
      if (!textEl.textContent.trim()) {
        textEl.textContent = 'Text';
      }
    });

    addOverlayElement(textEl, { x, y, overlayType: 'text' });
  } else if (type === 'speaker') {
    placeSpeakerBubble(x, y, text);
  }
}

function scheduleOverlayRemoval(el, ms = OVERLAY_DISPLAY_MS) {
  const existing = overlayRemovalTimers.get(el);
  if (existing?.timer) clearTimeout(existing.timer);

  const startedAt = Date.now();
  const timer = setTimeout(() => {
    el.remove();
    overlayRemovalTimers.delete(el);
  }, ms);

  overlayRemovalTimers.set(el, { timer, remainingMs: ms, startedAt, paused: false });
}

function pauseOverlayRemoval(el) {
  const entry = overlayRemovalTimers.get(el);
  if (!entry?.timer) return;
  clearTimeout(entry.timer);
  const remaining = Math.max(0, entry.remainingMs - (Date.now() - entry.startedAt));
  overlayRemovalTimers.set(el, { timer: null, remainingMs: remaining, startedAt: null, paused: true });
}

function resumeOverlayRemoval(el) {
  const entry = overlayRemovalTimers.get(el);
  if (!entry?.paused) return;
  scheduleOverlayRemoval(el, entry.remainingMs);
}

function clearAllOverlays() {
  const layer = getOverlayLayer();
  if (!layer) return;
  layer.innerHTML = '';
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function centerOverlayInLayer(el, layer) {
  layer.appendChild(el);
  const maxLeft = Math.max(0, layer.clientWidth - el.offsetWidth);
  const maxTop = Math.max(0, layer.clientHeight - el.offsetHeight);
  el.style.left = `${maxLeft / 2}px`;
  el.style.top = `${maxTop / 2}px`;
}

function clampOverlayPosition(el, layer) {
  const lw = layer.clientWidth;
  const lh = layer.clientHeight;
  if (lw < 2 || lh < 2) return;
  const elW = Math.min(el.offsetWidth || 28, 80);
  const elH = Math.min(el.offsetHeight || 28, 80);
  const maxLeft = Math.max(0, lw - elW);
  const maxTop = Math.max(0, lh - elH);
  const left = Math.min(maxLeft, Math.max(0, parseFloat(el.style.left) || 0));
  const top = Math.min(maxTop, Math.max(0, parseFloat(el.style.top) || 0));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function makeDraggable(el, layer) {
  preventNativeDrag(el);

  const beginMove = (e) => {
    if (el.dataset.editing === 'true') return;
    if (el.dataset.moving === 'true') return;
    if (!isPrimaryDragStart(e)) return;

    e.preventDefault();
    e.stopPropagation();
    pauseOverlayRemoval(el);
    el.dataset.moving = 'true';
    setOverlayDragging(true);

    const start = getEventClientPoint(e);
    if (!start) {
      delete el.dataset.moving;
      setOverlayDragging(false);
      resumeOverlayRemoval(el);
      return;
    }
    const origLeft = parseFloat(el.style.left) || 0;
    const origTop = parseFloat(el.style.top) || 0;
    let lastX = start.x;
    let lastY = start.y;
    let ended = false;
    let endTimer = null;

    const applyPoint = (point) => {
      if (!point) return;
      lastX = point.x;
      lastY = point.y;
      el.style.left = `${origLeft + (point.x - start.x)}px`;
      el.style.top = `${origTop + (point.y - start.y)}px`;
      clampOverlayPosition(el, layer);
    };

    const finish = (ev) => {
      if (ended) return;
      ended = true;
      clearTimeout(endTimer);
      applyPoint(
        (ev && ev.pointerType === 'touch' && ev.type !== 'touchend')
          ? { x: lastX, y: lastY }
          : (getEventClientPoint(ev) || { x: lastX, y: lastY })
      );
      detachWindowDragListeners(session);
      delete el.dataset.moving;
      setOverlayDragging(false);
      clampOverlayPosition(el, layer);
      resumeOverlayRemoval(el);
    };

    const session = {
      onPointerMove: (ev) => {
        ev.preventDefault();
        applyPoint(getEventClientPoint(ev));
      },
      onPointerUp: (ev) => {
        ev.preventDefault();
        if (ev.pointerType === 'touch') {
          clearTimeout(endTimer);
          endTimer = setTimeout(() => finish(ev), 50);
          return;
        }
        applyPoint(getEventClientPoint(ev));
        finish(ev);
      },
      onPointerCancel: (ev) => {
        ev.preventDefault();
      },
      onTouchMove: (ev) => {
        ev.preventDefault();
        applyPoint(getEventClientPoint(ev));
      },
      onTouchEnd: (ev) => {
        ev.preventDefault();
        clearTimeout(endTimer);
        finish(ev);
      },
      onTouchCancel: (ev) => {
        ev.preventDefault();
        finish(ev);
      }
    };

    attachWindowDragListeners(session);
  };

  el.addEventListener('pointerdown', beginMove, DRAG_LISTENER_OPTS);
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    beginMove(e);
  }, DRAG_LISTENER_OPTS);
}

function logOverlayForRecording(el, type, text, durationMs) {
  const layer = getOverlayLayer();
  if (!layer || !el) return;

  const lw = layer.clientWidth || 1;
  const lh = layer.clientHeight || 1;
  const left = parseFloat(el.style.left) || 0;
  const top = parseFloat(el.style.top) || 0;

  overlayRecordLog.push({
    type,
    xPercent: (left / lw) * 100,
    yPercent: (top / lh) * 100,
    videoTime: mediaElement ? mediaElement.currentTime : 0,
    durationMs: durationMs || OVERLAY_DISPLAY_MS,
    text: text || ''
  });
}

function overlaysForSnippetRange(startTime, endTime) {
  return overlayRecordLog
    .map((ev) => {
      const evStart = ev.videoTime;
      const evEnd = ev.videoTime + (ev.durationMs || OVERLAY_DISPLAY_MS) / 1000;
      const clipStart = Math.max(evStart, startTime);
      const clipEnd = Math.min(evEnd, endTime);
      if (clipEnd <= clipStart) return null;
      return {
        type: ev.type,
        xPercent: ev.xPercent,
        yPercent: ev.yPercent,
        offsetSeconds: clipStart - startTime,
        durationMs: (clipEnd - clipStart) * 1000,
        text: ev.text || ''
      };
    })
    .filter(Boolean);
}

function addOverlayElement(el, options = {}) {
  const { autoRemoveMs = OVERLAY_DISPLAY_MS, x, y, overlayType, overlayText } = options;
  const layer = getOverlayLayer();
  if (!layer) return null;

  if (!isVideoEditorOpen()) {
    showToast('Open a video before adding overlays.', 'error');
    return null;
  }

  el.classList.add('video-overlay-item');
  el.style.position = 'absolute';
  el.style.zIndex = '6';
  el.style.width = 'max-content';
  el.style.height = 'max-content';
  el.style.margin = '0';
  el.style.right = 'auto';
  el.style.bottom = 'auto';

  if (x != null && y != null) {
    syncOverlayLayerSize();
    layer.appendChild(el);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    clampOverlayPosition(el, layer);
  } else {
    centerOverlayInLayer(el, layer);
  }

  makeDraggable(el, layer);

  if (overlayType === 'arrow' || overlayType === 'speaker') {
    logOverlayForRecording(el, overlayType, overlayText || '', autoRemoveMs || OVERLAY_DISPLAY_MS);
  }

  if (autoRemoveMs) {
    scheduleOverlayRemoval(el, autoRemoveMs);
  }

  return el;
}

function placeSpeakerBubble(x, y, text) {
  const bubble = document.createElement('div');
  bubble.className = 'video-overlay-speaker';
  bubble.innerHTML = `${SPEAKER_ICON_HTML}<span class="video-overlay-speaker-text"></span>`;
  bubble.querySelector('.video-overlay-speaker-text').textContent = text;
  bubble.title = text;

  const estimatedSpeechMs = Math.max(OVERLAY_DISPLAY_MS, text.length * 100);
  addOverlayElement(bubble, { autoRemoveMs: estimatedSpeechMs, x, y, overlayType: 'speaker', overlayText: text });

  if (!window.speechSynthesis) {
    showToast('Text-to-speech is not supported in this browser.', 'error');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function getSnippetTitleInput() {
  return document.getElementById('snippetTitleInput');
}

function clearSnippetTitleInput() {
  const input = getSnippetTitleInput();
  if (input) input.value = '';
}

function readSnippetTitle() {
  const input = getSnippetTitleInput();
  return input ? input.value.trim() : '';
}

async function saveSnippetToDB(startTime, endTime) {
  if (!currentParentVideoId) {
    showToast('Select a library video before saving snippets.', 'error');
    return;
  }

  const snippetName = readSnippetTitle();
  if (!snippetName) {
    showToast('Enter a snippet title before saving.', 'error');
    getSnippetTitleInput()?.focus();
    return;
  }

  const tags = collectTagsForSave();

  try {
    const res = await apiFetch('/videos/snippet', {
      method: 'POST',
      body: JSON.stringify({
        parentVideoId: currentParentVideoId,
        startTime,
        endTime,
        snippetName,
        tags,
        muteAudio: videoAudioMuted,
        overlays: overlaysForSnippetRange(startTime, endTime)
      })
    });
    clearSnippetTitleInput();
    showToast(`Saved: ${res.snippetName}`);
  } catch (err) {
    showToast(`Error saving snippet: ${err.message}`, 'error');
  }
}
