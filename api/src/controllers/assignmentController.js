const crypto = require('crypto');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const Video = require('../models/Video');
const { sendPlayerVideoLink } = require('../utils/resendEmail');

function playerVideoUrl(accessToken) {
  const base = (process.env.FRONTEND_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  const path = `/player-video.html?token=${accessToken}`;
  return base ? `${base}${path}` : path;
}

/**
 * @desc    Assign Note/Task to Assistant Coach (Head Coach feature)
 * @route   POST /api/assignments/coach-note
 * @access  Private (HEAD_COACH)
 */
const assignCoachNote = async (req, res) => {
  try {
    const { coachId, note, videoId } = req.body;

    if (!coachId || !note) {
      return res.status(400).json({ error: 'Coach ID and note content are required.' });
    }

    const coach = await User.findOne({
      _id: coachId,
      teamId: req.user.teamId,
      role: 'COACH'
    });
    if (!coach) {
      return res.status(400).json({ error: 'Select a valid assistant coach on this team.' });
    }

    const assignment = new Assignment({
      teamId: req.user.teamId,
      assignedBy: req.user._id,
      assignedTo: coach._id,
      type: videoId ? 'VIDEO_COACH' : 'COACH_NOTE',
      note,
      videoId: videoId || null,
      completed: false
    });

    await assignment.save();

    res.status(201).json({ message: 'Assignment created for coach.', assignment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Assign Video or Snippet to Player (Creates unique token & sends Resend email)
 * @route   POST /api/assignments/player-video
 * @access  Private (HEAD_COACH, COACH)
 */
const assignVideoToPlayer = async (req, res) => {
  try {
    const { playerId, videoId, note } = req.body;

    if (!playerId || !videoId) {
      return res.status(400).json({ error: 'Player ID and Video ID are required.' });
    }

    const player = await User.findOne({ _id: playerId, teamId: req.user.teamId });
    const video = await Video.findOne({ _id: videoId, teamId: req.user.teamId });

    if (!player || !video) {
      return res.status(404).json({ error: 'Player or Video not found on this team.' });
    }
    if (player.role !== 'PLAYER') {
      return res.status(400).json({ error: 'Videos can only be assigned to players.' });
    }
    if (req.user.role === 'COACH' && String(player.assignedCoachId || '') !== String(req.user._id)) {
      return res.status(403).json({ error: 'You can only assign videos to players assigned to you.' });
    }

    const uniqueAccessToken = crypto.randomBytes(32).toString('hex');

    const assignment = new Assignment({
      teamId: req.user.teamId,
      assignedBy: req.user._id,
      assignedTo: playerId,
      type: 'VIDEO_PLAYER',
      note: note || '',
      videoId: video._id,
      uniqueAccessToken,
      hasClickedLink: false
    });

    await assignment.save();

    let emailSent = false;
    let emailError = null;
    try {
      await sendPlayerVideoLink(
        player.email,
        player.name,
        video.title,
        note,
        uniqueAccessToken
      );
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.error('Failed to send player video email:', err);
    }

    const playerLink = playerVideoUrl(uniqueAccessToken);

    if (!emailSent) {
      return res.status(201).json({
        message: 'Video assigned, but the email could not be sent. Copy the player link and share it manually.',
        emailSent: false,
        emailError,
        playerLink,
        assignment
      });
    }

    res.status(201).json({
      message: 'Video assigned and email link dispatched.',
      emailSent: true,
      playerLink,
      assignment
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Get Assignments for current logged in Coach (View notes & videos assigned to them)
 * @route   GET /api/assignments/my-assignments
 * @access  Private (HEAD_COACH, COACH)
 */
const getMyAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find({
      assignedTo: req.user._id,
      teamId: req.user.teamId,
      type: { $in: ['COACH_NOTE', 'VIDEO_COACH'] }
    })
    .populate('assignedBy', 'name role')
    .populate('videoId')
    .sort({ createdAt: -1 });

    res.status(200).json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Get All Player Video Assignments status (Track if link has been clicked)
 * @route   GET /api/assignments/player-status
 * @access  Private (HEAD_COACH, COACH)
 */
const getPlayerAssignmentStatus = async (req, res) => {
  try {
    const query = {
      teamId: req.user.teamId,
      type: 'VIDEO_PLAYER'
    };
    if (req.user.role !== 'HEAD_COACH') {
      query.assignedBy = req.user._id;
    }

    const assignments = await Assignment.find(query)
    .populate('assignedTo', 'name jerseyNumber email')
    .populate('assignedBy', 'name role')
    .populate('videoId', 'title isSnippet tags')
    .sort({ createdAt: -1 });

    const payload = assignments.map((a) => {
      const obj = a.toObject();
      if (obj.uniqueAccessToken) {
        obj.playerLink = playerVideoUrl(obj.uniqueAccessToken);
      }
      return obj;
    });

    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Toggle completion checkbox for a note assigned to coach
 * @route   PATCH /api/assignments/:id/complete
 * @access  Private (HEAD_COACH, COACH)
 */
const toggleAssignmentComplete = async (req, res) => {
  try {
    const { completed } = req.body;
    const { id } = req.params;

    const assignment = await Assignment.findOne({ _id: id, teamId: req.user.teamId });
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    const isHead = req.user.role === 'HEAD_COACH';
    const isAssignee = String(assignment.assignedTo) === String(req.user._id);
    const isAssigner = String(assignment.assignedBy) === String(req.user._id);
    if (!isHead && !isAssignee && !isAssigner) {
      return res.status(403).json({ error: 'You can only update your own assignments.' });
    }

    assignment.completed = completed !== undefined ? completed : !assignment.completed;
    await assignment.save();

    res.status(200).json({ message: 'Assignment status updated.', assignment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  assignCoachNote,
  assignVideoToPlayer,
  getMyAssignments,
  getPlayerAssignmentStatus,
  toggleAssignmentComplete
};
