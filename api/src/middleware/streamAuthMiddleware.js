const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Auth for video stream/download routes where <video> cannot send Authorization headers.
 * Accepts Bearer header or ?token= query param.
 */
const streamAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password -adminPassword');

    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (req.user.role === 'ADMIN' || req.user.isPlatformAdmin) {
      req.user.isVerified = true;
    }

    if (req.user.role === 'HEAD_COACH' && !req.user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email address before continuing.' });
    }

    if (req.user.role === 'PLAYER') {
      return res.status(403).json({ error: 'Players access assigned videos from the email link, not the coach workspace.' });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

module.exports = { streamAuth };
