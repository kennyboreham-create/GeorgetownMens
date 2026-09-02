const jwt = require('jsonwebtoken');
const Playbook = require('../models/Playbook');

/**
 * Auth for playbook viewers (share link password session).
 * Accepts Bearer header or ?token= query. Payload: { playbookId, shareToken, type: 'playbook_view' }
 */
const playbookViewAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Playbook access required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'playbook_view' || !decoded.playbookId) {
      return res.status(401).json({ error: 'Invalid playbook access token.' });
    }

    const playbook = await Playbook.findById(decoded.playbookId);
    if (!playbook || playbook.shareToken !== decoded.shareToken) {
      return res.status(401).json({ error: 'Playbook access expired or invalid.' });
    }

    req.playbook = playbook;
    req.playbookViewToken = token;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Playbook access expired or invalid.' });
  }
};

module.exports = { playbookViewAuth };
