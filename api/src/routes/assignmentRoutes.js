const express = require('express');
const router = express.Router();
const {
  assignCoachNote,
  assignVideoToPlayer,
  getMyAssignments,
  getPlayerAssignmentStatus,
  toggleAssignmentComplete
} = require('../controllers/assignmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/my-assignments', getMyAssignments);
router.get('/player-status', getPlayerAssignmentStatus);
router.post('/coach-note', authorize('HEAD_COACH'), assignCoachNote);
router.post('/player-video', assignVideoToPlayer);
router.patch('/:id/complete', toggleAssignmentComplete);

module.exports = router;