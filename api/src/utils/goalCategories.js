const GOAL_CATEGORIES = ['Skills', 'Behaviour', 'Strategy'];
const DEFAULT_GOAL_CATEGORY = 'Skills';

function normalizeGoalCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  return GOAL_CATEGORIES.find((category) => category.toLowerCase() === raw) || null;
}

function resolveGoalCategory(value) {
  return normalizeGoalCategory(value) || DEFAULT_GOAL_CATEGORY;
}

module.exports = {
  GOAL_CATEGORIES,
  DEFAULT_GOAL_CATEGORY,
  normalizeGoalCategory,
  resolveGoalCategory
};
