const Goal = require('../models/Goal');
const User = require('../models/User');
const { addOneCalendarMonth, targetDateForGoal } = require('../utils/goalTargetDate');
const { normalizeGoalCategory, resolveGoalCategory } = require('../utils/goalCategories');
const { normalizeGoalOrigin, resolveGoalOrigin } = require('../utils/goalOriginated');

function serializeGoal(goal) {
  const obj = goal.toObject ? goal.toObject() : { ...goal };
  obj.targetDate = targetDateForGoal(obj);
  obj.category = resolveGoalCategory(obj.category);
  obj.originated = resolveGoalOrigin(obj.originated);
  return obj;
}

/**
 * @desc    Get team players with active and completed goals
 * @route   GET /api/goals
 * @access  Private (HEAD_COACH, COACH)
 */
const getGoalsByTeam = async (req, res) => {
  try {
    const query = { teamId: req.user.teamId };
    if (req.user.role !== 'HEAD_COACH') {
      query.createdBy = req.user._id;
    }

    const goals = await Goal.find(query)
      .populate('playerId', 'name jerseyNumber')
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 });

    res.status(200).json(goals.map(serializeGoal));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Create a player goal (Enforces max 3 active ongoing goals limit)
 * @route   POST /api/goals
 * @access  Private (HEAD_COACH, COACH)
 */
const createGoal = async (req, res) => {
  try {
    const { playerId, description } = req.body;

    if (!playerId || !description) {
      return res.status(400).json({ error: 'Player ID and goal description are required.' });
    }

    const category = req.body.category !== undefined
      ? normalizeGoalCategory(req.body.category)
      : resolveGoalCategory();
    if (req.body.category !== undefined && !category) {
      return res.status(400).json({ error: 'Category must be Skills, Behaviour, or Strategy.' });
    }

    const originated = req.body.originated !== undefined
      ? normalizeGoalOrigin(req.body.originated)
      : resolveGoalOrigin();
    if (req.body.originated !== undefined && !originated) {
      return res.status(400).json({ error: 'Originated must be Coach or Player.' });
    }

    const player = await User.findOne({ _id: playerId, teamId: req.user.teamId, role: 'PLAYER' });
    if (!player) {
      return res.status(404).json({ error: 'Player not found on this team.' });
    }
    if (req.user.role === 'COACH' && String(player.assignedCoachId || '') !== String(req.user._id)) {
      return res.status(403).json({ error: 'You can only set goals for players assigned to you.' });
    }

    // Check count of active (non-completed) goals for player
    const activeCount = await Goal.countDocuments({
      teamId: req.user.teamId,
      playerId,
      completed: false
    });

    if (activeCount >= 3) {
      return res.status(400).json({ 
        error: 'This player already has 3 active ongoing goals. A goal must reach 100% completion to open a new slot.' 
      });
    }

    const createdAt = new Date();
    const goal = new Goal({
      teamId: req.user.teamId,
      playerId,
      description,
      category,
      originated,
      progress: 0,
      completed: false,
      createdBy: req.user._id,
      targetDate: addOneCalendarMonth(createdAt)
    });

    await goal.save();

    res.status(201).json({ message: 'Goal created successfully.', goal: serializeGoal(goal) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Update editable goal % box (When 100%, moves to completed)
 * @route   PATCH /api/goals/:id
 * @access  Private (HEAD_COACH, COACH)
 */
const updateGoalProgress = async (req, res) => {
  try {
    const { progress, category, originated } = req.body;
    const { id } = req.params;

    if (progress === undefined && category === undefined && originated === undefined) {
      return res.status(400).json({ error: 'Progress percentage, category, or originated is required.' });
    }

    const goal = await Goal.findOne({ _id: id, teamId: req.user.teamId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    if (req.user.role !== 'HEAD_COACH' && String(goal.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You can only update goals you created.' });
    }

    if (progress !== undefined) {
      const numericProgress = Math.min(100, Math.max(0, parseInt(progress, 10)));
      goal.progress = numericProgress;
      if (numericProgress >= 100) {
        goal.completed = true;
      }
    }

    if (category !== undefined) {
      const nextCategory = normalizeGoalCategory(category);
      if (!nextCategory) {
        return res.status(400).json({ error: 'Category must be Skills, Behaviour, or Strategy.' });
      }
      goal.category = nextCategory;
    }

    if (originated !== undefined) {
      const nextOrigin = normalizeGoalOrigin(originated);
      if (!nextOrigin) {
        return res.status(400).json({ error: 'Originated must be Coach or Player.' });
      }
      goal.originated = nextOrigin;
    }

    await goal.save();

    res.status(200).json({ message: 'Goal progress updated.', goal: serializeGoal(goal) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getGoalsByTeam,
  createGoal,
  updateGoalProgress
};