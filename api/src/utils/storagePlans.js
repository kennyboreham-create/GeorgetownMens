const GIB = 1024 * 1024 * 1024;

const PLANS = {
  free: {
    id: 'free',
    label: 'Included',
    monthlyCents: 0,
    yearlyCents: 0,
    monthlyLabel: null,
    yearlyLabel: null,
    limitBytes: 1 * GIB,
    limitLabel: '1 GB',
    skillsLibrary: false
  },
  plus: {
    id: 'plus',
    label: 'Plus',
    monthlyCents: 999,
    yearlyCents: 9900,
    monthlyLabel: '$9.99/mo',
    yearlyLabel: '$99/yr',
    limitBytes: 10 * GIB,
    limitLabel: '10 GB',
    skillsLibrary: true
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    monthlyCents: 1799,
    yearlyCents: 17900,
    monthlyLabel: '$17.99/mo',
    yearlyLabel: '$179/yr',
    limitBytes: 20 * GIB,
    limitLabel: '20 GB',
    skillsLibrary: true
  }
};

// Existing teams and older webhooks may still send "pro".
PLANS.pro = { ...PLANS.premium, id: 'pro' };

function canonicalPlanId(planId) {
  const id = String(planId || '').toLowerCase().trim();
  if (id === 'plus') return 'plus';
  if (id === 'pro' || id === 'premium') return 'premium';
  return 'free';
}

function canonicalInterval(interval) {
  return String(interval || '').toLowerCase().trim() === 'yearly' ? 'yearly' : 'monthly';
}

function listPaidPlans() {
  return [PLANS.plus, PLANS.premium];
}

function listPlanOffers() {
  return listPaidPlans().flatMap((plan) => ([
    {
      id: plan.id,
      interval: 'monthly',
      label: plan.label,
      priceLabel: plan.monthlyLabel,
      cents: plan.monthlyCents,
      limitLabel: plan.limitLabel,
      skillsLibrary: plan.skillsLibrary
    },
    {
      id: plan.id,
      interval: 'yearly',
      label: plan.label,
      priceLabel: plan.yearlyLabel,
      cents: plan.yearlyCents,
      limitLabel: plan.limitLabel,
      skillsLibrary: plan.skillsLibrary
    }
  ]));
}

function getPlan(planId) {
  return PLANS[canonicalPlanId(planId)] || PLANS.free;
}

function priceLabel(plan, interval) {
  const resolved = typeof plan === 'string' ? getPlan(plan) : (plan || PLANS.free);
  return canonicalInterval(interval) === 'yearly' ? resolved.yearlyLabel : resolved.monthlyLabel;
}

function effectivePlanId(team = {}) {
  const status = String(team.subscriptionStatus || 'inactive');
  const planId = canonicalPlanId(team.subscriptionPlan);
  if (status === 'active' && (planId === 'plus' || planId === 'premium')) {
    return planId;
  }
  return 'free';
}

function effectiveInterval(team = {}) {
  if (effectivePlanId(team) === 'free') return 'monthly';
  return canonicalInterval(team.subscriptionInterval);
}

function effectivePlan(team) {
  return getPlan(effectivePlanId(team));
}

function sameActiveOffer(team, planId, interval) {
  return team.subscriptionStatus === 'active'
    && canonicalPlanId(team.subscriptionPlan) === canonicalPlanId(planId)
    && canonicalInterval(team.subscriptionInterval || 'monthly') === canonicalInterval(interval);
}

function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const rounded = value < 10 && i > 0 && value !== Math.round(value)
    ? value.toFixed(1)
    : String(Math.round(value));
  return `${rounded} ${units[i]}`;
}

function canAcceptUpload(usedBytes, limitBytes, extraBytes = 0) {
  const used = Math.max(0, Number(usedBytes) || 0);
  const limit = Math.max(0, Number(limitBytes) || 0);
  const extra = Math.max(0, Number(extraBytes) || 0);
  return used + extra <= limit;
}

function storageLimitError(plan, usedBytes, extraBytes = 0) {
  const usedLabel = formatBytes(usedBytes);
  const extraNote = extraBytes > 0 ? ` This file is ${formatBytes(extraBytes)}.` : '';
  return `This team has reached its ${plan.limitLabel} storage limit (${usedLabel} used).${extraNote} A paid plan raises the cap and unlocks the skills video library.`;
}

function incomingUploadBytes(file) {
  if (!file) return 0;
  if (Number.isFinite(file.size)) return Math.max(0, file.size);
  if (file.buffer && Number.isFinite(file.buffer.length)) return file.buffer.length;
  return 0;
}

function publicUserSubscription(user, team) {
  const status = team?.subscriptionStatus || 'inactive';
  const plan = status === 'active' ? canonicalPlanId(team?.subscriptionPlan) : 'free';
  return {
    isPlatformAdmin: Boolean(user?.isPlatformAdmin),
    subscriptionStatus: status,
    plan,
    interval: team?.subscriptionInterval || 'monthly'
  };
}

module.exports = {
  GIB,
  PLANS,
  canonicalPlanId,
  canonicalInterval,
  listPaidPlans,
  listPlanOffers,
  getPlan,
  priceLabel,
  effectivePlanId,
  effectiveInterval,
  effectivePlan,
  sameActiveOffer,
  formatBytes,
  canAcceptUpload,
  storageLimitError,
  incomingUploadBytes,
  publicUserSubscription
};
