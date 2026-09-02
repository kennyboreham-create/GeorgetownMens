const Video = require('../models/Video');
const {
  extensionForUpload,
  removeFileQuietly,
  hasStoredVideoFile,
  pipeStoredVideo
} = require('../utils/localVideoStorage');
const { isR2Configured, r2ObjectKey, uploadLocalFileToR2, getSignedPutUrl, headR2Object } = require('../utils/r2VideoStorage');
const { deleteLibraryVideo } = require('../utils/deleteLibraryVideo');
const { assertTeamCanUpload, incomingUploadBytes } = require('../utils/teamStorageUsage');

function buildStreamPath(videoId) {
  return `/videos/${videoId}/stream`;
}

function parseOverlays(overlays) {
  if (!Array.isArray(overlays)) return [];
  return overlays.slice(0, 80).map((ov) => {
    const type = ov?.type === 'speaker' ? 'speaker' : ov?.type === 'arrow' ? 'arrow' : null;
    if (!type) return null;
    return {
      type,
      xPercent: Math.min(100, Math.max(0, Number(ov.xPercent) || 0)),
      yPercent: Math.min(100, Math.max(0, Number(ov.yPercent) || 0)),
      offsetSeconds: Math.max(0, Number(ov.offsetSeconds) || 0),
      durationMs: Math.max(400, Number(ov.durationMs) || 5000),
      text: type === 'speaker' ? String(ov.text || '').slice(0, 500) : ''
    };
  }).filter(Boolean);
}

function parseTagsInput(tags) {
  if (Array.isArray(tags)) {
    return tags.map(t => String(t).trim()).filter(Boolean);
  }
  if (typeof tags === 'string' && tags.trim()) {
    return tags.split(',').map(t => t.trim()).filter(Boolean);
  }
  return [];
}

function isYouTubeHost(hostname) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  return host === 'youtube.com'
    || host === 'm.youtube.com'
    || host === 'music.youtube.com'
    || host === 'youtu.be'
    || host === 'youtube-nocookie.com';
}

/** Accepts plain seconds, mm:ss, or h:mm:ss. Returns integer seconds or null. */
function parseTimestampToSeconds(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.floor(Number(raw));
  }

  const parts = raw.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) {
    return null;
  }

  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (nums.length === 2) {
    const [m, s] = nums;
    if (s >= 60) return null;
    return m * 60 + s;
  }

  const [h, m, s] = nums;
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

function normalizeYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
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

/**
 * Team videos always (match user.teamId).
 * Global videos (isGlobal: true, not a snippet) only for HEAD_COACH — teamId is ignored
 * (including null), so every head coach sees them. COACH/PLAYER never get the global branch.
 */
function buildTeamVideoAccessFilter(user) {
  if (user.role === 'HEAD_COACH') {
    return {
      $or: [
        { teamId: user.teamId },
        { isGlobal: true, isSnippet: { $ne: true } }
      ]
    };
  }
  return { teamId: user.teamId };
}

async function findAccessibleVideo(videoId, user) {
  return Video.findOne({
    _id: videoId,
    ...buildTeamVideoAccessFilter(user)
  });
}

/**
 * @desc    Upload Full Game Video (JSON body with external URL)
 * @route   POST /api/videos/upload
 * @access  Private (HEAD_COACH, COACH)
 */
const uploadVideo = async (req, res) => {
  try {
    const { title, url, tags } = req.body;

    if (!title || !url) {
      return res.status(400).json({ error: 'Video title and URL/file are required.' });
    }

    const parsedTags = Array.isArray(tags)
      ? tags
      : (tags ? tags.split(',').map(t => t.trim()) : []);

    const video = new Video({
      teamId: req.user.teamId,
      title,
      url,
      tags: parsedTags,
      isSnippet: false
    });

    await video.save();

    res.status(201).json({ message: 'Video uploaded successfully.', video });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Insert a team-scoped YouTube video with optional clip start/end (no file upload)
 * @route   POST /api/videos/insert-youtube
 * @access  Private (HEAD_COACH)
 */
const insertYouTubeVideo = async (req, res) => {
  try {
    const { title, url, tags, clipStartSeconds, clipEndSeconds, startTime, endTime } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Video title is required.' });
    }

    const normalizedUrl = normalizeYouTubeUrl(url);
    if (!normalizedUrl) {
      return res.status(400).json({ error: 'A valid YouTube URL is required.' });
    }

    const start = parseTimestampToSeconds(
      clipStartSeconds !== undefined ? clipStartSeconds : startTime
    );
    const end = parseTimestampToSeconds(
      clipEndSeconds !== undefined ? clipEndSeconds : endTime
    );

    if (start === null || end === null || start < 0 || end < 0) {
      return res.status(400).json({
        error: 'Start and stop times are required (seconds or mm:ss).'
      });
    }

    if (end <= start) {
      return res.status(400).json({ error: 'Stop time must be greater than start time.' });
    }

    const video = new Video({
      teamId: req.user.teamId,
      title: String(title).trim(),
      url: normalizedUrl,
      gridFsId: null,
      tags: parseTagsInput(tags),
      isSnippet: false,
      isGlobal: false,
      clipStartSeconds: start,
      clipEndSeconds: end
    });

    await video.save();

    res.status(201).json({ message: 'YouTube video inserted successfully.', video });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Upload Full Game Video file (multipart) to Cloudflare R2. Firestore stores metadata only.
 * @route   POST /api/videos/upload/file
 * @access  Private (HEAD_COACH, COACH)
 */
const uploadVideoFile = async (req, res) => {
  let video = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A video file is required.' });
    }

    if (!isR2Configured()) {
      await removeFileQuietly(req.file.path);
      return res.status(503).json({ error: 'Cloudflare R2 is not configured on this server.' });
    }

    try {
      await assertTeamCanUpload(req.user.teamId, incomingUploadBytes(req.file));
    } catch (quotaErr) {
      await removeFileQuietly(req.file.path);
      return res.status(quotaErr.status || 403).json({
        error: quotaErr.message,
        code: quotaErr.code || 'STORAGE_LIMIT'
      });
    }

    const { title, tags } = req.body;
    if (!title || !title.trim()) {
      await removeFileQuietly(req.file.path);
      return res.status(400).json({ error: 'Video title is required.' });
    }

    const parsedTags = Array.isArray(tags)
      ? tags
      : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    video = new Video({
      teamId: req.user.teamId,
      title: title.trim(),
      url: 'pending',
      tags: parsedTags,
      isSnippet: false,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype
    });

    await video.save();

    const ext = extensionForUpload(req.file);
    const objectKey = r2ObjectKey(req.user.teamId, video._id, ext);
    await uploadLocalFileToR2({
      key: objectKey,
      filePath: req.file.path,
      contentType: req.file.mimetype
    });
    await removeFileQuietly(req.file.path);

    video.r2ObjectKey = objectKey;
    video.localFilePath = undefined;
    video.gridFsId = null;
    video.url = buildStreamPath(video._id);
    await video.save();

    res.status(201).json({ message: 'Video uploaded successfully.', video });
  } catch (error) {
    await removeFileQuietly(req.file && req.file.path);
    if (video && video._id && video.url === 'pending') {
      try {
        await Video.deleteOne({ _id: video._id });
      } catch {
        // keep the original upload error
      }
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Create a pending library video and return a Cloudflare R2 signed PUT URL.
 *          Browser uploads go directly to R2 so Firebase Functions stay under the request-size cap.
 * @route   POST /api/videos/upload/file/init
 * @access  Private (HEAD_COACH, COACH)
 */
const initDirectUpload = async (req, res) => {
  try {
    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Cloudflare R2 is not configured on this server.' });
    }

    const { title, tags, filename, contentType, size } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Video title is required.' });
    }
    const bytes = Number(size) || 0;
    if (bytes <= 0) {
      return res.status(400).json({ error: 'A video file is required.' });
    }

    try {
      await assertTeamCanUpload(req.user.teamId, bytes);
    } catch (quotaErr) {
      return res.status(quotaErr.status || 403).json({
        error: quotaErr.message,
        code: quotaErr.code || 'STORAGE_LIMIT'
      });
    }

    const video = new Video({
      teamId: req.user.teamId,
      title: String(title).trim(),
      url: 'pending',
      tags: parseTagsInput(tags),
      isSnippet: false,
      originalFilename: filename || 'video.mp4',
      mimeType: contentType || 'video/mp4'
    });
    await video.save();

    const ext = extensionForUpload({
      originalname: video.originalFilename,
      mimetype: video.mimeType
    });
    const objectKey = r2ObjectKey(req.user.teamId, video._id, ext);
    const uploadUrl = await getSignedPutUrl(objectKey, {
      contentType: video.mimeType || 'video/mp4'
    });

    res.status(201).json({
      message: 'Upload URL ready.',
      video,
      uploadUrl,
      objectKey
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Confirm a direct R2 upload and mark the library video playable.
 * @route   POST /api/videos/upload/file/complete
 * @access  Private (HEAD_COACH, COACH)
 */
const completeDirectUpload = async (req, res) => {
  try {
    const videoId = req.body.videoId || req.body.id;
    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required.' });
    }

    const video = await Video.findOne({ _id: videoId, teamId: req.user.teamId });
    if (!video || video.url !== 'pending') {
      return res.status(404).json({ error: 'Pending video upload not found.' });
    }

    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Cloudflare R2 is not configured on this server.' });
    }

    const ext = extensionForUpload({
      originalname: video.originalFilename,
      mimetype: video.mimeType
    });
    const objectKey = r2ObjectKey(req.user.teamId, video._id, ext);
    const head = await headR2Object(objectKey);
    if (!head) {
      await Video.deleteOne({ _id: video._id });
      return res.status(400).json({ error: 'Video file was not found in storage. Upload the file, then try again.' });
    }

    video.r2ObjectKey = objectKey;
    video.localFilePath = undefined;
    video.gridFsId = null;
    video.url = buildStreamPath(video._id);
    await video.save();

    res.status(201).json({ message: 'Video uploaded successfully.', video });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Stream a stored video from Cloudflare R2 or redirect external URLs
 * @route   GET /api/videos/:id/stream
 * @access  Private (token in header or query)
 */
const streamVideo = async (req, res) => {
  try {
    const video = await findAccessibleVideo(req.params.id, req.user);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (await pipeStoredVideo(video, req, res)) {
      return;
    }

    if (video.url && /^https?:\/\//i.test(video.url)) {
      return res.redirect(video.url);
    }

    return res.status(404).json({ error: 'Video file is not available for streaming.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Download a stored video file
 * @route   GET /api/videos/:id/download
 * @access  Private (token in header or query)
 */
const downloadVideo = async (req, res) => {
  try {
    const video = await findAccessibleVideo(req.params.id, req.user);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (await pipeStoredVideo(video, req, res, { download: true })) {
      return;
    }

    if (video.url && /^https?:\/\//i.test(video.url)) {
      return res.redirect(video.url);
    }

    return res.status(404).json({ error: 'Video file is not available for download.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Save Video Snippet with coach-provided title
 * @route   POST /api/videos/snippet
 * @access  Private (HEAD_COACH, COACH)
 */
const saveSnippet = async (req, res) => {
  try {
    const { parentVideoId, videoUrl, startTime, endTime, tags, snippetName: requestedSnippetName, muteAudio, overlays } = req.body;

    if (startTime === undefined || endTime === undefined) {
      return res.status(400).json({ error: 'Start time and end time are required for a snippet.' });
    }

    const snippetName = typeof requestedSnippetName === 'string' ? requestedSnippetName.trim() : '';
    if (!snippetName) {
      return res.status(400).json({ error: 'A snippet title is required.' });
    }

    let resolvedVideoUrl = videoUrl;

    if (parentVideoId) {
      // HEAD_COACH may snippet from a global parent; snippet itself stays on their team
      const parentVideo = await findAccessibleVideo(parentVideoId, req.user);
      if (!parentVideo) {
        return res.status(404).json({ error: 'Parent video not found.' });
      }
      if (!hasStoredVideoFile(parentVideo)) {
        return res.status(400).json({
          error: 'Snippets cannot be created from YouTube or external-link videos. Upload a file to the library first.'
        });
      }
      resolvedVideoUrl = parentVideo.url;
    }

    if (!resolvedVideoUrl) {
      return res.status(400).json({ error: 'A source video is required for this snippet.' });
    }

    const parsedTags = parseTagsInput(tags);

    const snippet = new Video({
      teamId: req.user.teamId,
      title: snippetName,
      url: resolvedVideoUrl,
      tags: parsedTags,
      isSnippet: true,
      parentVideoId: parentVideoId || null,
      startTime,
      endTime,
      muteAudio: Boolean(muteAudio),
      overlays: parseOverlays(overlays)
    });

    await snippet.save();

    res.status(201).json({
      message: 'Snippet saved successfully.',
      snippetName,
      snippet
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Get All Videos & Snippets with filter by tags and file/title name in same query.
 *          Query: fullOnly=1 (exclude snippets), uploadOnly=1 (R2 files only, no YouTube/links).
 * @route   GET /api/videos
 * @access  Private (HEAD_COACH, COACH)
 */
const getVideos = async (req, res) => {
  try {
    const { search, tag, fullOnly, uploadOnly } = req.query;
    const accessFilter = buildTeamVideoAccessFilter(req.user);
    const andClauses = [accessFilter];

    if (fullOnly === 'true' || fullOnly === '1') {
      andClauses.push({ isSnippet: false });
    }

    // File-backed uploads only (snippet browser) — Cloudflare R2, not YouTube/links
    if (uploadOnly === 'true' || uploadOnly === '1') {
      andClauses.push({
        r2ObjectKey: { $exists: true, $nin: [null, ''] }
      });
      andClauses.push({ mimeType: { $ne: 'video/youtube' } });
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      andClauses.push({
        $or: [
          { title: searchRegex },
          { tags: { $in: [searchRegex] } }
        ]
      });
    }

    if (tag) {
      andClauses.push({ tags: tag });
    }

    const query = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
    const videos = await Video.find(query).sort({ createdAt: -1 });

    res.status(200).json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Unique tags for the current team (unfiltered by search)
 * @route   GET /api/videos/tags
 * @access  Private (HEAD_COACH, COACH)
 */
const getVideoTags = async (req, res) => {
  try {
    const tags = await Video.distinct('tags', buildTeamVideoAccessFilter(req.user));
    const unique = tags
      .filter((t) => typeof t === 'string' && t.trim())
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    res.status(200).json(unique);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Add tags to an existing video/snippet
 * @route   PATCH /api/videos/:id/tags
 * @access  Private (HEAD_COACH, COACH)
 */
const addTags = async (req, res) => {
  try {
    const { tags } = req.body;
    const { id } = req.params;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be provided as an array.' });
    }

    const video = await Video.findOne({ _id: id, teamId: req.user.teamId });
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const updatedTags = Array.from(new Set([...video.tags, ...tags]));
    video.tags = updatedTags;
    await video.save();

    res.status(200).json({ message: 'Tags updated.', tags: video.tags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Delete a library video. Originals also remove Cloudflare R2 bytes and child snippets.
 * @route   DELETE /api/videos/:id
 * @access  Private (HEAD_COACH, COACH)
 */
const deleteVideo = async (req, res) => {
  try {
    const result = await deleteLibraryVideo(req.params.id, req.user.teamId);
    if (!result) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    res.status(200).json({
      message: result.isSnippet ? 'Snippet deleted.' : 'Video deleted.',
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  uploadVideo,
  uploadVideoFile,
  initDirectUpload,
  completeDirectUpload,
  insertYouTubeVideo,
  streamVideo,
  downloadVideo,
  saveSnippet,
  getVideos,
  getVideoTags,
  addTags,
  deleteVideo,
  buildStreamPath
};
