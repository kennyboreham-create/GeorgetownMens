const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { isR2Configured, pipeR2Video, redirectToSignedR2 } = require('./r2VideoStorage');

const ALLOWED_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.ogg']);

function getIncomingDir() {
  return path.join(os.tmpdir(), 'chme-video-incoming');
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function extensionForUpload(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_EXT.has(fromName)) return fromName;
  if (file.mimetype === 'video/webm') return '.webm';
  if (file.mimetype === 'video/quicktime') return '.mov';
  if (file.mimetype === 'video/ogg') return '.ogv';
  return '.mp4';
}

function incomingFilename(file) {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extensionForUpload(file)}`;
}

async function removeFileQuietly(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignore missing temp files
  }
}

function hasStoredVideoFile(video) {
  return Boolean(video && video.r2ObjectKey && String(video.r2ObjectKey).trim());
}

function hasStoredMedia(block) {
  return Boolean(block && block.r2ObjectKey && String(block.r2ObjectKey).trim());
}

/**
 * Stream a file-backed video from Cloudflare R2.
 * Uses a short-lived signed URL so Firebase Functions do not proxy video bytes.
 * Returns true if a stored file was found and sent.
 */
async function pipeStoredVideo(video, req, res, { download = false } = {}) {
  const key = video && String(video.r2ObjectKey || '').trim();
  if (!key) return false;

  if (!isR2Configured()) {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Video is stored in Cloudflare R2, but this server is missing R2 credentials.' });
    }
    return true;
  }

  try {
    await redirectToSignedR2(key, req, res, {
      filename: video.originalFilename || `${video.title || 'video'}.mp4`,
      contentType: video.mimeType || 'video/mp4',
      download
    });
    return true;
  } catch (err) {
    console.warn('[R2] Signed URL redirect failed, piping through API:', err.message);
    await pipeR2Video(video, req, res, { download });
    return true;
  }
}

async function pipeStoredMedia(block, req, res, { download = false } = {}) {
  const key = block && String(block.r2ObjectKey || '').trim();
  if (!key) return false;

  if (!isR2Configured()) {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Media is stored in Cloudflare R2, but this server is missing R2 credentials.' });
    }
    return true;
  }

  try {
    await redirectToSignedR2(key, req, res, {
      filename: block.originalFilename || 'media',
      contentType: block.mimeType || 'application/octet-stream',
      download
    });
    return true;
  } catch (err) {
    console.warn('[R2] Signed media URL redirect failed, piping through API:', err.message);
    await pipeR2Video({
      r2ObjectKey: key,
      mimeType: block.mimeType,
      originalFilename: block.originalFilename,
      title: 'media'
    }, req, res, { download });
    return true;
  }
}

module.exports = {
  getIncomingDir,
  ensureDirSync,
  extensionForUpload,
  incomingFilename,
  removeFileQuietly,
  hasStoredVideoFile,
  hasStoredMedia,
  pipeStoredVideo,
  pipeStoredMedia
};
