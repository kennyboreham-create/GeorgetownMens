const Assignment = require('../models/Assignment');
const Video = require('../models/Video');
const { pipeStoredVideo } = require('../utils/localVideoStorage');

async function resolveSourceVideo(videoDoc) {
  if (!videoDoc) return null;

  if (videoDoc.isSnippet && videoDoc.parentVideoId) {
    return Video.findById(videoDoc.parentVideoId);
  }

  return videoDoc;
}

/**
 * @desc    Public Direct Access for player video link (tracks click status)
 * @route   GET /api/player/access-video/:token
 * @access  Public
 */
const accessPlayerVideo = async (req, res) => {
  try {
    const { token } = req.params;

    const assignment = await Assignment.findOne({ uniqueAccessToken: token })
      .populate('videoId')
      .populate('assignedBy', 'name role');

    if (!assignment) {
      return res.status(404).json({ error: 'Invalid or expired video link.' });
    }

    if (!assignment.hasClickedLink) {
      assignment.hasClickedLink = true;
      assignment.linkClickedAt = new Date();
      await assignment.save();
    }

    res.status(200).json({
      video: assignment.videoId,
      note: assignment.note,
      assignedBy: assignment.assignedBy,
      assignmentId: assignment._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Stream assigned video for public player link
 * @route   GET /api/player/access-video/:token/stream
 * @access  Public (assignment token)
 */
const streamPlayerVideo = async (req, res) => {
  try {
    const assignment = await Assignment.findOne({ uniqueAccessToken: req.params.token })
      .populate('videoId');

    if (!assignment || !assignment.videoId) {
      return res.status(404).json({ error: 'Invalid or expired video link.' });
    }

    const sourceVideo = await resolveSourceVideo(assignment.videoId);
    if (!sourceVideo) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (await pipeStoredVideo(sourceVideo, req, res)) {
      return;
    }

    if (sourceVideo.url && /^https?:\/\//i.test(sourceVideo.url)) {
      return res.redirect(sourceVideo.url);
    }

    return res.status(404).json({ error: 'Video file is not available for streaming.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Report watch progress for assigned player video
 * @route   PATCH /api/player/access-video/:token/watch
 * @access  Public (assignment token)
 */
const reportWatchProgress = async (req, res) => {
  try {
    const { token } = req.params;
    const { watchDurationSeconds } = req.body;

    const seconds = Math.max(0, Math.floor(Number(watchDurationSeconds) || 0));
    if (seconds <= 0) {
      return res.status(400).json({ error: 'watchDurationSeconds must be a positive number.' });
    }

    const assignment = await Assignment.findOne({ uniqueAccessToken: token });
    if (!assignment) {
      return res.status(404).json({ error: 'Invalid or expired video link.' });
    }

    assignment.watchDurationSeconds = (assignment.watchDurationSeconds || 0) + seconds;
    assignment.lastWatchedAt = new Date();
    await assignment.save();

    res.status(200).json({
      message: 'Watch progress recorded.',
      watchDurationSeconds: assignment.watchDurationSeconds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  accessPlayerVideo,
  streamPlayerVideo,
  reportWatchProgress
};