const CoachNote = require('../models/CoachNote');
const PlayerNote = require('../models/PlayerNote');
const User = require('../models/User');

async function findAssignablePlayer(req, playerId) {
  const player = await User.findOne({ _id: playerId, teamId: req.user.teamId, role: 'PLAYER' });
  if (!player) {
    return { errorStatus: 404, error: 'Player not found on this team.' };
  }
  if (req.user.role === 'COACH' && String(player.assignedCoachId || '') !== String(req.user._id)) {
    return { errorStatus: 403, error: 'You can only add notes for players assigned to you.' };
  }
  return { player };
}

const listCoachNotes = async (req, res) => {
  try {
    const query = { teamId: req.user.teamId };
    if (req.user.role !== 'HEAD_COACH') {
      query.authorId = req.user._id;
    }

    const notes = await CoachNote.find(query)
      .populate('authorId', 'name role')
      .sort({ createdAt: -1 });

    res.status(200).json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createCoachNote = async (req, res) => {
  try {
    const body = (req.body.body || req.body.note || '').trim();
    if (!body) {
      return res.status(400).json({ error: 'Note text is required.' });
    }

    const note = await CoachNote.create({
      teamId: req.user.teamId,
      authorId: req.user._id,
      body,
      completed: false
    });

    await note.populate('authorId', 'name role');

    res.status(201).json({ message: 'Note saved.', note });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleCoachNoteComplete = async (req, res) => {
  try {
    const note = await CoachNote.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    const isAuthor = String(note.authorId) === String(req.user._id);
    if (!isAuthor && req.user.role !== 'HEAD_COACH') {
      return res.status(403).json({ error: 'You can only update your own notes.' });
    }

    note.completed = Boolean(req.body.completed);
    await note.save();

    res.status(200).json({ message: 'Note updated.', note });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteCoachNote = async (req, res) => {
  try {
    const note = await CoachNote.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    const isAuthor = String(note.authorId) === String(req.user._id);
    if (!isAuthor && req.user.role !== 'HEAD_COACH') {
      return res.status(403).json({ error: 'You can only delete your own notes.' });
    }

    await note.deleteOne();
    res.status(200).json({ message: 'Note deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const listPlayerNotes = async (req, res) => {
  try {
    const query = { teamId: req.user.teamId };
    if (req.user.role !== 'HEAD_COACH') {
      query.authorId = req.user._id;
    }

    const notes = await PlayerNote.find(query)
      .populate('authorId', 'name role')
      .populate('playerId', 'name jerseyNumber')
      .sort({ createdAt: -1 });

    res.status(200).json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createPlayerNote = async (req, res) => {
  try {
    const playerId = req.body.playerId;
    const body = (req.body.body || req.body.note || '').trim();
    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required.' });
    }
    if (!body) {
      return res.status(400).json({ error: 'Note text is required.' });
    }
    if (body.length > 4000) {
      return res.status(400).json({ error: 'Note text must be 4000 characters or fewer.' });
    }

    const found = await findAssignablePlayer(req, playerId);
    if (found.error) {
      return res.status(found.errorStatus).json({ error: found.error });
    }

    const note = await PlayerNote.create({
      teamId: req.user.teamId,
      playerId,
      authorId: req.user._id,
      body
    });

    await note.populate('authorId', 'name role');
    await note.populate('playerId', 'name jerseyNumber');

    res.status(201).json({ message: 'Player note saved.', note });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deletePlayerNote = async (req, res) => {
  try {
    const note = await PlayerNote.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    const isAuthor = String(note.authorId) === String(req.user._id);
    if (!isAuthor && req.user.role !== 'HEAD_COACH') {
      return res.status(403).json({ error: 'You can only delete your own notes.' });
    }

    await note.deleteOne();
    res.status(200).json({ message: 'Note deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  listCoachNotes,
  createCoachNote,
  toggleCoachNoteComplete,
  deleteCoachNote,
  listPlayerNotes,
  createPlayerNote,
  deletePlayerNote
};
