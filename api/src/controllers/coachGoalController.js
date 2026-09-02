const CoachGoal = require('../models/CoachGoal');
const User = require('../models/User');
const {
  MAX_COACH_GOALS,
  STEPS_PER_GOAL,
  buildDefaultSteps,
  serializeCoachGoal
} = require('../utils/coachGoalProgress');
const { normalizeGoalCategory, resolveGoalCategory } = require('../utils/goalCategories');

function canMutateGoal(req, goal) {
  return String(goal.createdBy) === String(req.user._id);
}

/**
 * @desc    List the signed-in coach's goals (with steps and drills)
 * @route   GET /api/coach-goals
 * @access  Private (HEAD_COACH, COACH)
 */
const getMyCoachGoals = async (req, res) => {
  try {
    const goals = await CoachGoal.find({
      teamId: req.user.teamId,
      createdBy: req.user._id
    }).sort({ createdAt: -1 });

    res.status(200).json({
      goals: goals.map((goal) => serializeCoachGoal(goal)),
      remaining: Math.max(0, MAX_COACH_GOALS - goals.length),
      maxGoals: MAX_COACH_GOALS
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Team-wide coach goals with percentages only (no steps)
 * @route   GET /api/coach-goals/team
 * @access  Private (HEAD_COACH, COACH)
 */
const getTeamCoachGoals = async (req, res) => {
  try {
    const [goals, coaches] = await Promise.all([
      CoachGoal.find({ teamId: req.user.teamId })
        .populate('createdBy', 'name role')
        .sort({ createdAt: -1 }),
      User.find({
        teamId: req.user.teamId,
        role: { $in: ['HEAD_COACH', 'COACH'] }
      }).select('name role').sort({ role: 1, name: 1 })
    ]);

    const serialized = goals.map((goal) => serializeCoachGoal(goal, { includeSteps: false }));

    res.status(200).json({
      goals: serialized,
      coaches
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Create a coach goal with 3 steps and 6 placeholder drills each
 * @route   POST /api/coach-goals
 * @access  Private (HEAD_COACH, COACH)
 */
const createCoachGoal = async (req, res) => {
  try {
    const title = String(req.body.title || req.body.description || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Goal name is required.' });
    }

    const activeCount = await CoachGoal.countDocuments({
      teamId: req.user.teamId,
      createdBy: req.user._id
    });
    if (activeCount >= MAX_COACH_GOALS) {
      return res.status(400).json({
        error: `You already have ${MAX_COACH_GOALS} goals. Delete one to create another.`
      });
    }

    const stepNames = Array.isArray(req.body.steps)
      ? req.body.steps.map((step) => (typeof step === 'string' ? step : (step && step.name) || ''))
      : [req.body.step1, req.body.step2, req.body.step3];

    if (Array.isArray(req.body.steps) && req.body.steps.length > STEPS_PER_GOAL) {
      return res.status(400).json({ error: `A goal has ${STEPS_PER_GOAL} steps.` });
    }

    const category = req.body.category !== undefined
      ? normalizeGoalCategory(req.body.category)
      : resolveGoalCategory();
    if (req.body.category !== undefined && !category) {
      return res.status(400).json({ error: 'Category must be Skills, Behaviour, or Strategy.' });
    }

    const goal = await CoachGoal.create({
      teamId: req.user.teamId,
      createdBy: req.user._id,
      title,
      category,
      steps: buildDefaultSteps(stepNames)
    });

    res.status(201).json({
      message: 'Goal created.',
      goal: serializeCoachGoal(goal)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Rename a coach goal
 * @route   PATCH /api/coach-goals/:id
 * @access  Private (HEAD_COACH, COACH)
 */
const updateCoachGoal = async (req, res) => {
  try {
    const goal = await CoachGoal.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    if (!canMutateGoal(req, goal)) {
      return res.status(403).json({ error: 'You can only update your own goals.' });
    }

    const hasTitle = req.body.title !== undefined;
    const hasCategory = req.body.category !== undefined;
    if (!hasTitle && !hasCategory) {
      return res.status(400).json({ error: 'Goal name or category is required.' });
    }

    if (hasTitle) {
      const title = String(req.body.title || '').trim();
      if (!title) {
        return res.status(400).json({ error: 'Goal name is required.' });
      }
      goal.title = title;
    }

    if (hasCategory) {
      const category = normalizeGoalCategory(req.body.category);
      if (!category) {
        return res.status(400).json({ error: 'Category must be Skills, Behaviour, or Strategy.' });
      }
      goal.category = category;
    }

    await goal.save();

    res.status(200).json({ message: 'Goal updated.', goal: serializeCoachGoal(goal) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Rename a step
 * @route   PATCH /api/coach-goals/:id/steps/:stepId
 * @access  Private (HEAD_COACH, COACH)
 */
const updateCoachGoalStep = async (req, res) => {
  try {
    const goal = await CoachGoal.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    if (!canMutateGoal(req, goal)) {
      return res.status(403).json({ error: 'You can only update your own goals.' });
    }

    const step = goal.steps.id(req.params.stepId);
    if (!step) {
      return res.status(404).json({ error: 'Step not found.' });
    }

    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Step name is required.' });
    }

    step.name = name;
    await goal.save();

    res.status(200).json({ message: 'Step updated.', goal: serializeCoachGoal(goal) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Rename a drill and/or mark it complete
 * @route   PATCH /api/coach-goals/:id/drills/:drillId
 * @access  Private (HEAD_COACH, COACH)
 */
const updateCoachGoalDrill = async (req, res) => {
  try {
    const goal = await CoachGoal.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    if (!canMutateGoal(req, goal)) {
      return res.status(403).json({ error: 'You can only update your own goals.' });
    }

    let drill = null;
    for (const step of goal.steps) {
      drill = step.drills.id(req.params.drillId);
      if (drill) break;
    }
    if (!drill) {
      return res.status(404).json({ error: 'Drill not found.' });
    }

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Drill name is required.' });
      }
      drill.name = name;
    }

    if (req.body.completed !== undefined) {
      drill.completed = Boolean(req.body.completed);
    }

    await goal.save();

    res.status(200).json({ message: 'Drill updated.', goal: serializeCoachGoal(goal) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Delete a coach goal
 * @route   DELETE /api/coach-goals/:id
 * @access  Private (HEAD_COACH, COACH)
 */
const deleteCoachGoal = async (req, res) => {
  try {
    const goal = await CoachGoal.findOne({ _id: req.params.id, teamId: req.user.teamId });
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    if (!canMutateGoal(req, goal)) {
      return res.status(403).json({ error: 'You can only delete your own goals.' });
    }

    await goal.deleteOne();
    res.status(200).json({ message: 'Goal deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyCoachGoals,
  getTeamCoachGoals,
  createCoachGoal,
  updateCoachGoal,
  updateCoachGoalStep,
  updateCoachGoalDrill,
  deleteCoachGoal
};
