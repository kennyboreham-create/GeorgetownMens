const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Team = require('../models/Team');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/resendEmail');
const {
  ensureAdminUser,
  canAccessAdmin,
  passwordAllowsAdmin,
  readAdminEnv
} = require('../utils/ensureAdminUser');
const { publicUserSubscription } = require('../utils/storagePlans');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const COACH_ROLES = ['HEAD_COACH', 'COACH'];

const hashResetToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

/**
 * @desc    Register Head Coach & Create Team
 * @route   POST /api/auth/register-head-coach
 * @access  Public
 */
const registerHeadCoach = async (req, res) => {
  try {
    const { name, email, password, teamName } = req.body;

    if (!name || !email || !password || !teamName) {
      return res.status(400).json({ error: 'Please provide all required fields.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 1. Create Head Coach User (unverified)
    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'HEAD_COACH',
      verificationToken,
      isVerified: false
    });
    await user.save();

    // 2. Create Team linked to Head Coach
    let team;
    try {
      team = new Team({
        name: teamName.trim(),
        headCoachId: user._id
      });
      await team.save();

      user.teamId = team._id;
      await user.save();
    } catch (teamError) {
      // Rollback user if team creation fails
      try {
        await User.findByIdAndDelete(user._id);
      } catch (rollbackError) {
        console.error('Failed to rollback user after team creation error:', rollbackError);
      }
      throw teamError;
    }

    // 3. Send Verification Email via Resend
    let emailSent = false;
    let emailError = null;
    try {
      await sendVerificationEmail(normalizedEmail, verificationToken);
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.error('Failed to send verification email:', err);
    }

    if (!emailSent) {
      return res.status(201).json({
        message: 'Account created, but the verification email could not be sent. Use "Resend verification email" on the login page.',
        emailSent: false,
        emailError
      });
    }

    return res.status(201).json({
      message: 'Head Coach registered successfully. Please check your email to verify your account.',
      emailSent: true
    });
  } catch (error) {
    console.error('Register Controller Error:', error);
    if (res.headersSent) {
      return;
    }
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'Email already registered.' });
    }
    return res.status(500).json({ error: error.message || 'Server error during registration.' });
  }
};

/**
 * @desc    Resend verification email for unverified Head Coach
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail, role: 'HEAD_COACH' });

    if (!user) {
      return res.status(404).json({ error: 'No head coach account found for that email.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'This account is already verified. You can log in.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    await sendVerificationEmail(normalizedEmail, verificationToken);

    return res.status(200).json({
      message: 'Verification email sent. Please check your inbox and spam folder.'
    });
  } catch (error) {
    console.error('Resend Verification Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to resend verification email.' });
  }
};

/**
 * @desc    Verify Head Coach Email Token
 * @route   GET /api/auth/verify
 * @access  Public
 */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    console.error('Verify Email Error:', error);
    return res.status(500).json({ error: error.message || 'Server error during verification.' });
  }
};

/**
 * @desc    Login User (Head Coach or Assistant Coach)
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail }).populate(
      'teamId',
      'name subscriptionPlan subscriptionStatus subscriptionInterval'
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.role === 'COACH' && !user.isVerified) {
      return res.status(403).json({
        error: 'Please set your password from the invite email before logging in. Check your inbox, or use Forgot password to get a new link.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.role === 'ADMIN') {
      return res.status(403).json({
        error: 'Use the admin login page to sign in as an admin.'
      });
    }

    if (user.role === 'PLAYER') {
      return res.status(403).json({
        error: 'Players access assigned videos from the email link, not the coach login.'
      });
    }

    // Require verification for Head Coach before access
    if (user.role === 'HEAD_COACH' && !user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    return res.status(200).json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId ? user.teamId._id : null,
        teamName: user.teamId ? user.teamId.name : null,
        isVerified: user.isVerified,
        ...publicUserSubscription(user, user.teamId)
      }
    });
  } catch (error) {
    console.error('Login Controller Error:', error);
    return res.status(500).json({ error: error.message || 'Server error during login.' });
  }
};

/**
 * @desc    Request password reset email (coaches / head coaches only)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  const genericMessage =
    'If an account with that email exists, a password reset link has been sent.';

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({
      email: normalizedEmail,
      role: { $in: COACH_ROLES }
    });

    // Always return the same message to avoid account enumeration
    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashResetToken(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    try {
      await sendPasswordResetEmail(normalizedEmail, rawToken);
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      console.error('Failed to send password reset email:', err);
      return res.status(500).json({ error: 'Failed to send password reset email. Please try again later.' });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ error: error.message || 'Server error during password reset request.' });
  }
};

/**
 * @desc    Reset password using emailed token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const hashedToken = hashResetToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
      role: { $in: COACH_ROLES }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.isVerified = true;
    await user.save();

    return res.status(200).json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({ error: error.message || 'Server error during password reset.' });
  }
};

/**
 * @desc    Login admin (subscription library)
 * @route   POST /api/auth/admin-login
 * @access  Public
 */
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password.' });
    }

    const bootstrap = await ensureAdminUser();
    if (!bootstrap.ok && bootstrap.reason === 'missing_env') {
      return res.status(503).json({
        error: 'Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD on the hockey-anal backend, then redeploy.'
      });
    }
    if (!bootstrap.ok && bootstrap.reason === 'password_too_short') {
      return res.status(503).json({
        error: 'ADMIN_PASSWORD must be at least 8 characters on the hockey-anal backend.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const configured = readAdminEnv();
    if (configured.email && normalizedEmail !== configured.email) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !canAccessAdmin(user)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await passwordAllowsAdmin(user, password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    return res.status(200).json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: 'ADMIN',
        isVerified: true
      }
    });
  } catch (error) {
    console.error('Admin Login Controller Error:', error);
    return res.status(500).json({ error: error.message || 'Server error during admin login.' });
  }
};

module.exports = {
  registerHeadCoach,
  resendVerification,
  verifyEmail,
  login,
  adminLogin,
  forgotPassword,
  resetPassword
};
