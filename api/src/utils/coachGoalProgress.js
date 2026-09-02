const { resolveGoalCategory } = require('./goalCategories');

const STEPS_PER_GOAL = 3;
const DRILLS_PER_STEP = 6;
const MAX_COACH_GOALS = 10;

function defaultDrillName(index) {
  return `Drill ${index + 1}`;
}

function defaultStepName(index) {
  return `Step ${index + 1}`;
}

function buildDefaultDrills() {
  return Array.from({ length: DRILLS_PER_STEP }, (_, index) => ({
    name: defaultDrillName(index),
    completed: false
  }));
}

function normalizeStepName(name, index) {
  const trimmed = String(name || '').trim();
  return trimmed || defaultStepName(index);
}

function buildDefaultSteps(stepNames) {
  const names = Array.isArray(stepNames) ? stepNames : [];
  return Array.from({ length: STEPS_PER_GOAL }, (_, index) => ({
    name: normalizeStepName(names[index], index),
    drills: buildDefaultDrills()
  }));
}

function countCompletedDrills(drills) {
  return (Array.isArray(drills) ? drills : []).filter((drill) => drill && drill.completed).length;
}

function drillTotals(drills) {
  const list = Array.isArray(drills) ? drills : [];
  return {
    completedDrills: countCompletedDrills(list),
    totalDrills: list.length
  };
}

function progressPercent(completedDrills, totalDrills) {
  if (!totalDrills) return 0;
  return (completedDrills / totalDrills) * 100;
}

function stepProgress(step) {
  const totals = drillTotals(step && step.drills);
  return {
    ...totals,
    progress: progressPercent(totals.completedDrills, totals.totalDrills)
  };
}

function goalDrillList(goal) {
  return (goal && Array.isArray(goal.steps) ? goal.steps : [])
    .flatMap((step) => (step && Array.isArray(step.drills) ? step.drills : []));
}

function goalProgress(goal) {
  const totals = drillTotals(goalDrillList(goal));
  return {
    ...totals,
    progress: progressPercent(totals.completedDrills, totals.totalDrills)
  };
}

function serializeStep(step) {
  const obj = step && step.toObject ? step.toObject() : { ...(step || {}) };
  return {
    ...obj,
    ...stepProgress(obj)
  };
}

function serializeCoachGoal(goal, { includeSteps = true } = {}) {
  const obj = goal && goal.toObject ? goal.toObject() : { ...(goal || {}) };
  const summary = goalProgress(obj);
  const serialized = {
    ...obj,
    category: resolveGoalCategory(obj.category),
    ...summary
  };
  if (includeSteps) {
    serialized.steps = (obj.steps || []).map(serializeStep);
  } else {
    delete serialized.steps;
  }
  return serialized;
}

module.exports = {
  STEPS_PER_GOAL,
  DRILLS_PER_STEP,
  MAX_COACH_GOALS,
  defaultDrillName,
  defaultStepName,
  buildDefaultDrills,
  buildDefaultSteps,
  countCompletedDrills,
  progressPercent,
  stepProgress,
  goalProgress,
  serializeCoachGoal
};
