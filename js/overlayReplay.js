const OVERLAY_REPLAY_ARROW_HTML = `
      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 56 L56 8 M56 8 H28 M56 8 V36" stroke="#fbbf24" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 56 L56 8 M56 8 H28 M56 8 V36" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const OVERLAY_REPLAY_SPEAKER_HTML = `
  <span class="video-overlay-speaker-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  </span>
`;

function attachSnippetOverlayReplay(videoEl, layerEl, overlays, snippetStartTime) {
  if (!videoEl || !layerEl || !Array.isArray(overlays) || !overlays.length) {
    return () => {};
  }

  const start = Number(snippetStartTime) || 0;
  const fired = new Set();
  let lastRelative = 0;

  const relativeTime = () => Math.max(0, videoEl.currentTime - start);

  const spawn = (ov) => {
    const el = document.createElement('div');
    el.classList.add('video-overlay-item');
    el.style.position = 'absolute';
    el.style.width = 'max-content';
    el.style.height = 'max-content';
    el.style.left = `${Number(ov.xPercent) || 0}%`;
    el.style.top = `${Number(ov.yPercent) || 0}%`;
    el.style.pointerEvents = 'none';

    if (ov.type === 'arrow') {
      el.classList.add('video-overlay-arrow');
      el.innerHTML = OVERLAY_REPLAY_ARROW_HTML;
    } else if (ov.type === 'speaker') {
      el.classList.add('video-overlay-speaker');
      el.innerHTML = `${OVERLAY_REPLAY_SPEAKER_HTML}<span class="video-overlay-speaker-text"></span>`;
      const text = ov.text || '';
      const textNode = el.querySelector('.video-overlay-speaker-text');
      if (textNode) textNode.textContent = text;
      if (text && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
      }
    } else {
      return;
    }

    layerEl.appendChild(el);
    const ms = Math.max(400, Number(ov.durationMs) || 5000);
    setTimeout(() => el.remove(), ms);
  };

  const reset = () => {
    layerEl.innerHTML = '';
    fired.clear();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const onTime = () => {
    const t = relativeTime();
    if (t + 0.35 < lastRelative) {
      reset();
    }
    lastRelative = t;

    overlays.forEach((ov, index) => {
      if (fired.has(index)) return;
      const begin = Number(ov.offsetSeconds) || 0;
      const end = begin + (Number(ov.durationMs) || 5000) / 1000;
      if (t >= begin && t < end) {
        fired.add(index);
        spawn(ov);
      }
    });
  };

  videoEl.addEventListener('timeupdate', onTime);
  videoEl.addEventListener('play', onTime);
  videoEl.addEventListener('seeked', onTime);

  return () => {
    videoEl.removeEventListener('timeupdate', onTime);
    videoEl.removeEventListener('play', onTime);
    videoEl.removeEventListener('seeked', onTime);
    reset();
  };
}
