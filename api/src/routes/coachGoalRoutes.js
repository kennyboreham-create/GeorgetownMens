const express = require('express');
const router = express.Router();
const {
  getMyCoachGoals,
  getTeamCoachGoals,
  createCoachGoal,
  updateCoachGoal,
  updateCoachGoalStep,
  updateCoachGoalDrill,
  deleteCoachGoal
} = require('../controllers/coachGoalController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/', getMyCoachGoals);
router.get('/team', getTeamCoachGoals);
router.post('/', createCoachGoal);
router.patch('/:id', updateCoachGoal);
router.patch('/:id/steps/:stepId', updateCoachGoalStep);
router.patch('/:id/drills/:drillId', updateCoachGoalDrill);
router.delete('/:id', deleteCoachGoal);

module.exports = router;
