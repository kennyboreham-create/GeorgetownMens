function addOneCalendarMonth(from = new Date()) {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return null;
  const day = start.getDate();
  const target = new Date(start);
  target.setMonth(target.getMonth() + 1);
  if (target.getDate() !== day) {
    target.setDate(0);
  }
  return target;
}

function targetDateForGoal(goal) {
  if (goal && goal.targetDate) {
    const stored = new Date(goal.targetDate);
    if (!Number.isNaN(stored.getTime())) return stored;
  }
  if (goal && goal.createdAt) {
    return addOneCalendarMonth(goal.createdAt);
  }
  return addOneCalendarMonth();
}

module.exports = {
  addOneCalendarMonth,
  targetDateForGoal
};
