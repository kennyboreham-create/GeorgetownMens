const WhiteboardItem = require('../models/WhiteboardItem');

function normalizeWhiteboardUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch (_) {
    return null;
  }
}

const listWhiteboardItems = async (req, res) => {
  try {
    const items = await WhiteboardItem.find({ teamId: req.user.teamId }).sort({ createdAt: 1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createWhiteboardItem = async (req, res) => {
  try {
    const kind = String(req.body.kind || '').toLowerCase();
    if (!['text', 'x', 'o'].includes(kind)) {
      return res.status(400).json({ error: 'Item type must be text, x, or o.' });
    }

    const text = kind === 'text' ? String(req.body.text || '').trim() : kind.toUpperCase();
    if (kind === 'text' && !text) {
      return res.status(400).json({ error: 'Enter a word to add to the whiteboard.' });
    }

    const x = Math.min(98, Math.max(2, Number(req.body.x) || 50));
    const y = Math.min(98, Math.max(2, Number(req.body.y) || (kind === 'text' ? 18 : 70)));
    const url = normalizeWhiteboardUrl(req.body.url);
    if (url === null) {
      return res.status(400).json({ error: 'Enter a valid http or https link.' });
    }

    const item = await WhiteboardItem.create({
      teamId: req.user.teamId,
      createdBy: req.user._id,
      kind,
      text,
      x,
      y,
      url
    });

    res.status(201).json({ message: 'Added to whiteboard.', item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const moveWhiteboardItem = async (req, res) => {
  try {
    const item = await WhiteboardItem.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!item) {
      return res.status(404).json({ error: 'Whiteboard item not found.' });
    }

    if (req.body.x != null) item.x = Math.min(98, Math.max(2, Number(req.body.x)));
    if (req.body.y != null) item.y = Math.min(98, Math.max(2, Number(req.body.y)));
    await item.save();

    res.status(200).json({ message: 'Position saved.', item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteWhiteboardItem = async (req, res) => {
  try {
    const item = await WhiteboardItem.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!item) {
      return res.status(404).json({ error: 'Whiteboard item not found.' });
    }
    await item.deleteOne();
    res.status(200).json({ message: 'Removed from whiteboard.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  listWhiteboardItems,
  createWhiteboardItem,
  moveWhiteboardItem,
  deleteWhiteboardItem
};
