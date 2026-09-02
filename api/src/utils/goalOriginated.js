const GOAL_ORIGINS = ['Coach', 'Player'];
const DEFAULT_GOAL_ORIGIN = 'Coach';

function normalizeGoalOrigin(value) {
  const raw = String(value || '').trim().toLowerCase();
  return GOAL_ORIGINS.find((origin) => origin.toLowerCase() === raw) || null;
}

function resolveGoalOrigin(value) {
  return normalizeGoalOrigin(value) || DEFAULT_GOAL_ORIGIN;
}

module.exports = {
  GOAL_ORIGINS,
  DEFAULT_GOAL_ORIGIN,
  normalizeGoalOrigin,
  resolveGoalOrigin
};
