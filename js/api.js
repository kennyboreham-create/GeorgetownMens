function resolveApiBaseUrl() {
  if (window.API_BASE_URL) {
    return String(window.API_BASE_URL).replace(/\/$/, '');
  }

  const { hostname, port } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return port === '5000' ? '/api' : 'http://localhost:5000/api';
  }

  // Firebase Hosting / production: same-origin via Hosting rewrites to Cloud Functions
  return '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

function redirectAfterUnauthorized() {
  const path = window.location.pathname || '';
  if (path.includes('login.html')) return;
  localStorage.clear();
  window.location.href = path.includes('admin') ? '/admin-login.html' : '/login.html';
}

function extractErrorMessage(text, status) {
  if (!text) {
    return `Request failed with status ${status}`;
  }

  try {
    const json = JSON.parse(text);
    return json.error || json.message || `Request failed with status ${status}`;
  } catch (_) {
    const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
      return preMatch[1].trim();
    }
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
      || `Request failed with status ${status}`;
  }
}

/**
 * Universal Fetch API wrapper with automatic Auth token injection and safe JSON parsing
 */
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const requestUrl = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(requestUrl, {
      ...options,
      headers,
      redirect: 'follow'
    });

    // Safely retrieve raw text first to avoid crash on empty body or HTML error responses
    const text = await response.text();
    let data = {};
    let parseFailed = false;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        parseFailed = true;
        data = { error: extractErrorMessage(text, response.status) };
      }
    } else if (response.ok) {
      parseFailed = true;
      const onStaticSite = response.url.startsWith(window.location.origin)
        && response.status === 200
        && text.length === 0;
      data = {
        error: onStaticSite
          ? `API not available on this static host (${window.location.origin}). Deploy with Firebase Hosting rewrites, or set window.API_BASE_URL in js/config.js to your Cloud Functions URL + /api.`
          : `Empty response body (HTTP ${response.status}) from ${requestUrl}`
      };
    }

    if (!response.ok) {
      if (response.status === 401) redirectAfterUnauthorized();
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }

    if (parseFailed) {
      throw new Error(data.error || `Invalid server response (HTTP ${response.status}) from ${requestUrl}`);
    }

    return data;
  } catch (error) {
    console.error(`API Fetch Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * Multipart upload helper (FormData). Do not set Content-Type; browser adds boundary.
 */
async function apiUploadFetch(endpoint, formData) {
  const token = localStorage.getItem('token');
  const headers = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const requestUrl = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: formData
    });

    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { error: extractErrorMessage(text, response.status) };
      }
    }

    if (!response.ok) {
      if (response.status === 401) redirectAfterUnauthorized();
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Upload Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * Direct-to-R2 upload: ask the API for a signed PUT URL, send the file to
 * Cloudflare R2, then mark the library video complete. Avoids the Firebase
 * Functions request-size limit while keeping video bytes off Firestore.
 */
async function apiUploadVideoFile({ file, title, tags }) {
  const init = await apiFetch('/videos/upload/file/init', {
    method: 'POST',
    body: JSON.stringify({
      title,
      tags,
      filename: file.name,
      contentType: file.type || 'video/mp4',
      size: file.size
    })
  });

  const put = await fetch(init.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'video/mp4'
    },
    body: file
  });
  if (!put.ok) {
    throw new Error('Upload to Cloudflare R2 failed. Confirm bucket CORS allows PUT from this site.');
  }

  return apiFetch('/videos/upload/file/complete', {
    method: 'POST',
    body: JSON.stringify({ videoId: init.video && init.video._id })
  });
}

function getVideoStreamUrl(videoId) {
  const token = localStorage.getItem('token');
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE_URL}/videos/${videoId}/stream${tokenQuery}`;
}

function getVideoDownloadUrl(videoId) {
  const token = localStorage.getItem('token');
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE_URL}/videos/${videoId}/download${tokenQuery}`;
}

/** True when the video bytes live in Cloudflare R2 — not YouTube/external. */
function hasStoredVideoFile(video) {
  return Boolean(video && video.r2ObjectKey && String(video.r2ObjectKey).trim());
}

/** True for youtube.com / youtu.be watch, short, or embed links (not playable as <video src>). */
function isYouTubeUrl(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'youtube.com'
      || host === 'm.youtube.com'
      || host === 'music.youtube.com'
      || host === 'youtu.be'
      || host === 'youtube-nocookie.com';
  } catch {
    return false;
  }
}

/** Returns https://www.youtube.com/embed/ID[?start=&end=] or null if ID cannot be parsed. */
function toYouTubeEmbedUrl(url, options = {}) {
  if (!isYouTubeUrl(url)) return null;
  try {
    const parsed = new URL(url);
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

    const params = new URLSearchParams();
    const start = options.startSeconds != null ? Math.floor(Number(options.startSeconds)) : null;
    const end = options.endSeconds != null ? Math.floor(Number(options.endSeconds)) : null;
    if (Number.isFinite(start) && start >= 0) params.set('start', String(start));
    if (Number.isFinite(end) && end > 0) params.set('end', String(end));
    if (options.enablejsapi) params.set('enablejsapi', '1');

    const qs = params.toString();
    return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ''}`;
  } catch {
    return null;
  }
}
