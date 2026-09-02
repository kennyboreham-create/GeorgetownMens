const { canonicalPlanId, canonicalInterval } = require('./storagePlans');
const { checkoutPayload } = require('./paypalSubscription');

function parseSquareSubscriptionEvent(body = {}) {
  if (body.teamId && (body.plan || body.subscriptionPlan)) {
    return {
      teamId: String(body.teamId),
      plan: String(body.plan || body.subscriptionPlan),
      interval: String(body.interval || body.subscriptionInterval || 'monthly'),
      status: String(body.status || body.subscriptionStatus || 'active'),
      squareSubscriptionId: body.squareSubscriptionId || body.subscriptionId || null,
      squareCustomerId: body.squareCustomerId || body.customerId || null
    };
  }

  const subscription = body.data?.object?.subscription || body.object?.subscription;
  if (subscription) {
    return {
      teamId: subscription.metadata?.teamId || subscription.reference_id || null,
      plan: subscription.metadata?.plan || null,
      interval: subscription.metadata?.interval || 'monthly',
      status: subscription.status === 'ACTIVE' ? 'active' : String(subscription.status || '').toLowerCase(),
      squareSubscriptionId: subscription.id || null,
      squareCustomerId: subscription.customer_id || null
    };
  }

  return null;
}

function applySubscriptionToTeam(team, {
  plan,
  interval,
  status,
  squareSubscriptionId,
  squareCustomerId,
  paypalSubscriptionId,
  paypalPayerId
} = {}) {
  const resolved = String(status || 'active').toLowerCase();
  const canceled = resolved === 'canceled' || resolved === 'cancelled';

  if (canceled) {
    team.subscriptionStatus = 'canceled';
    team.subscriptionPlan = 'free';
    team.subscriptionInterval = 'monthly';
    team.subscriptionRequestedPlan = undefined;
    team.subscriptionRequestedInterval = undefined;
  } else {
    const planId = canonicalPlanId(plan);
    const billing = canonicalInterval(interval);
    team.subscriptionPlan = planId;
    team.subscriptionInterval = billing;
    team.subscriptionStatus = 'active';
    team.subscriptionRequestedPlan = planId;
    team.subscriptionRequestedInterval = billing;
  }

  if (squareSubscriptionId) team.squareSubscriptionId = squareSubscriptionId;
  if (squareCustomerId) team.squareCustomerId = squareCustomerId;
  if (paypalSubscriptionId) team.paypalSubscriptionId = paypalSubscriptionId;
  if (paypalPayerId) team.paypalPayerId = paypalPayerId;
  team.subscriptionUpdatedAt = new Date();
  return team;
}

function isPaidPlanId(planId) {
  const id = canonicalPlanId(planId);
  return id === 'plus' || id === 'premium';
}

function paidPlanIds() {
  return ['plus', 'premium', 'pro'];
}

module.exports = {
  checkoutPayload,
  parseSquareSubscriptionEvent,
  applySubscriptionToTeam,
  paidPlanIds,
  isPaidPlanId
};
