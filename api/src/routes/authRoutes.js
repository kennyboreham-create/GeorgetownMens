const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const {
  registerHeadCoach,
  resendVerification,
  verifyEmail,
  login,
  adminLogin,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');

router.post('/register-head-coach', asyncHandler(registerHeadCoach));
router.post('/resend-verification', asyncHandler(resendVerification));
router.get('/verify', asyncHandler(verifyEmail));
router.post('/login', asyncHandler(login));
router.post('/admin-login', asyncHandler(adminLogin));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));

module.exports = router;