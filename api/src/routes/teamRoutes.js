const express = require('express');
const router = express.Router();
const {
  addPlayer,
  addCoach,
  getTeamMembers,
  assignPlayerToCoach,
  getTeamStorage,
  getTeamQuota,
  requestTeamSubscription,
  confirmPayPalSubscription
} = require('../controllers/teamController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/members', getTeamMembers);
router.get('/quota', getTeamQuota);
router.get('/storage', authorize('HEAD_COACH'), getTeamStorage);
router.post('/subscription', authorize('HEAD_COACH'), requestTeamSubscription);
router.post('/subscription/paypal-confirm', authorize('HEAD_COACH'), confirmPayPalSubscription);
router.post('/players', authorize('HEAD_COACH'), addPlayer);
router.post('/coaches', authorize('HEAD_COACH'), addCoach);
router.patch('/players/:id/coach', authorize('HEAD_COACH'), assignPlayerToCoach);

module.exports = router;
