const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protects routes by validating JWT from the Authorization header.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-password -adminPassword');
      if (!req.user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if Head Coach has verified their email before allowing actions
      if (req.user.role === 'HEAD_COACH' && !req.user.isVerified) {
        return res.status(403).json({ error: 'Please verify your email address before continuing.' });
      }

      if (req.user.role === 'ADMIN' || req.user.isPlatformAdmin) {
        req.user.isVerified = true;
      }

      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }
};

/**
 * Restricts access based on user role (e.g. authorize('HEAD_COACH'))
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    const allowed = roles.includes(req.user.role)
      || (roles.includes('ADMIN') && req.user.isPlatformAdmin);
    if (!allowed) {
      return res.status(403).json({ error: `User role '${req.user.role}' is not authorized to access this route` });
    }
    next();
  };
};

module.exports = { protect, authorize };