const express = require('express');
const router = express.Router();
const { getGoalsByTeam, createGoal, updateGoalProgress } = require('../controllers/goalController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/', getGoalsByTeam);
router.post('/', createGoal);
router.patch('/:id', updateGoalProgress);

module.exports = router;