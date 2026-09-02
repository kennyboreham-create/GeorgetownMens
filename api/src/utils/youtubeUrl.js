function isYouTubeHost(hostname) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  return host === 'youtube.com'
    || host === 'm.youtube.com'
    || host === 'music.youtube.com'
    || host === 'youtu.be'
    || host === 'youtube-nocookie.com';
}

function normalizeYouTubeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (!/^https?:$/i.test(parsed.protocol) || !isYouTubeHost(parsed.hostname)) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  let id = '';
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else {
    id = parsed.searchParams.get('v') || '';
    if (!id) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const marker = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live' || p === 'v');
      if (marker >= 0 && parts[marker + 1]) id = parts[marker + 1];
    }
  }

  id = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

module.exports = {
  isYouTubeHost,
  normalizeYouTubeUrl
};
