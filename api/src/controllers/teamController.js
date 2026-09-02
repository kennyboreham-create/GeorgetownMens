const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Team = require('../models/Team');
const { computeTeamStorage } = require('../utils/teamStorageUsage');
const { getPlan, canonicalPlanId, canonicalInterval, priceLabel, sameActiveOffer, listPlanOffers } = require('../utils/storagePlans');
const { applySubscriptionToTeam, isPaidPlanId } = require('../utils/squareSubscription');
const {
  checkoutPayload,
  createPayPalCheckout,
  parsePayPalSubscriptionEvent,
  fetchPayPalSubscription,
  subscriptionToApplyPayload,
  verifyPayPalWebhook,
  paypalReady
} = require('../utils/paypalSubscription');
const { sendCoachInviteEmail, COACH_INVITE_TTL_DAYS } = require('../utils/resendEmail');

const INVITE_TOKEN_TTL_MS = COACH_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

const hashResetToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * @desc    Add Player to Team (Head Coach feature)
 * @route   POST /api/team/players
 * @access  Private (HEAD_COACH)
 */
const addPlayer = async (req, res) => {
  try {
    const { name, jerseyNumber, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Player name and email are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Players use magic-link access, not dashboard login
    const dummyPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const player = new User({
      name,
      email,
      jerseyNumber: jerseyNumber || null,
      role: 'PLAYER',
      teamId: req.user.teamId,
      password: dummyPassword,
      isVerified: true
    });

    await player.save();

    res.status(201).json({
      message: 'Player added to team successfully.',
      player: {
        id: player._id,
        name: player.name,
        jerseyNumber: player.jerseyNumber,
        email: player.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Assign / Add Assistant Coach to Team (Head Coach feature)
 * @route   POST /api/team/coaches
 * @access  Private (HEAD_COACH)
 */
const addCoach = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required for a new coach.' });
    }

    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).toLowerCase().trim();

    if (!trimmedName || !normalizedEmail) {
      return res.status(400).json({ error: 'Name and email are required for a new coach.' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Invitees set their own password from email; this hash is unusable until then.
    const dummyPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const rawToken = crypto.randomBytes(32).toString('hex');

    const coach = new User({
      name: trimmedName,
      email: normalizedEmail,
      password: dummyPassword,
      role: 'COACH',
      teamId: req.user.teamId,
      isVerified: false,
      resetPasswordToken: hashResetToken(rawToken),
      resetPasswordExpires: new Date(Date.now() + INVITE_TOKEN_TTL_MS)
    });

    await coach.save();

    try {
      await sendCoachInviteEmail(normalizedEmail, rawToken, trimmedName);
    } catch (err) {
      try {
        await User.findByIdAndDelete(coach._id);
      } catch (rollbackError) {
        console.error('Failed to rollback coach after invite email error:', rollbackError);
      }
      console.error('Failed to send coach invite email:', err);
      return res.status(500).json({ error: 'Failed to send invite email. Please try again later.' });
    }

    res.status(201).json({
      message: 'Coach invited. They will receive an email to create their password.',
      emailSent: true,
      coach: {
        id: coach._id,
        name: coach.name,
        email: coach.email,
        role: coach.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Get All Team Members (Coaches & Players isolated to caller's team)
 * @route   GET /api/team/members
 * @access  Private (HEAD_COACH, COACH)
 */
const getTeamMembers = async (req, res) => {
  try {
    const members = await User.find({ teamId: req.user.teamId })
      .select('-password -adminPassword -verificationToken -resetPasswordToken -resetPasswordExpires')
      .populate('assignedCoachId', 'name role')
      .sort({ role: 1, name: 1 });

    const coaches = members.filter(m => m.role === 'HEAD_COACH' || m.role === 'COACH');
    let players = members.filter(m => m.role === 'PLAYER');

    if (req.user.role === 'COACH') {
      players = players.filter((p) => p.assignedCoachId && String(p.assignedCoachId._id || p.assignedCoachId) === String(req.user._id));
    }

    res.status(200).json({ coaches, players });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @desc    Assign a player to an assistant coach
 * @route   PATCH /api/team/players/:id/coach
 * @access  Private (HEAD_COACH)
 */
const assignPlayerToCoach = async (req, res) => {
  try {
    const { coachId } = req.body;
    const player = await User.findOne({
      _id: req.params.id,
      teamId: req.user.teamId,
      role: 'PLAYER'
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found on this team.' });
    }

    if (!coachId) {
      player.assignedCoachId = null;
    } else {
      const coach = await User.findOne({
        _id: coachId,
        teamId: req.user.teamId,
        role: 'COACH'
      });
      if (!coach) {
        return res.status(400).json({ error: 'Select a valid assistant coach.' });
      }
      player.assignedCoachId = coach._id;
    }

    await player.save();

    res.status(200).json({
      message: 'Player assignment updated.',
      player: {
        id: player._id,
        assignedCoachId: player.assignedCoachId
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function storageResponse(usage) {
  const { team, ...rest } = usage;
  return {
    ...rest,
    plans: listPlanOffers()
  };
}

/**
 * @desc    Combined storage (Firestore + Cloudflare R2) used by the logged-in head coach's team
 * @route   GET /api/team/storage
 * @access  Private (HEAD_COACH)
 */
const getTeamStorage = async (req, res) => {
  try {
    if (!req.user.teamId) {
      return res.status(400).json({ error: 'No team is associated with this account.' });
    }

    const usage = await computeTeamStorage(req.user.teamId);
    if (String(usage.team.headCoachId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Storage usage is only available for your own team.' });
    }

    res.status(200).json(storageResponse(usage));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

/**
 * @desc    Team storage quota for upload checks (head coach or assistant)
 * @route   GET /api/team/quota
 * @access  Private (HEAD_COACH, COACH)
 */
const getTeamQuota = async (req, res) => {
  try {
    if (!req.user.teamId) {
      return res.status(400).json({ error: 'No team is associated with this account.' });
    }

    const usage = await computeTeamStorage(req.user.teamId);
    res.status(200).json({
      teamId: usage.teamId,
      usedBytes: usage.usedBytes,
      usedLabel: usage.usedLabel,
      limitBytes: usage.limitBytes,
      limitLabel: usage.limitLabel,
      remainingBytes: usage.remainingBytes,
      remainingLabel: usage.remainingLabel,
      usedPercent: usage.usedPercent,
      canUpload: usage.canUpload,
      plan: usage.plan,
      planLabel: usage.planLabel,
      skillsLibrary: usage.skillsLibrary
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

/**
 * @desc    Request or update a paid storage plan until PayPal confirms
 * @route   POST /api/team/subscription
 * @access  Private (HEAD_COACH)
 */
const requestTeamSubscription = async (req, res) => {
  try {
    const planId = canonicalPlanId(req.body.plan);
    const interval = canonicalInterval(req.body.interval);
    if (!isPaidPlanId(planId)) {
      return res.status(400).json({ error: 'Choose Plus or Premium, monthly or yearly.' });
    }

    const team = await Team.findById(req.user.teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }
    if (String(team.headCoachId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the head coach can change this team’s storage plan.' });
    }

    if (sameActiveOffer(team, planId, interval)) {
      return res.status(200).json({
        message: `This team is already on ${getPlan(planId).label} (${priceLabel(planId, interval)}).`,
        activated: true,
        checkout: checkoutPayload(planId, interval)
      });
    }

    const plan = getPlan(planId);
    const price = priceLabel(plan, interval);

    const isUpdate = team.subscriptionStatus === 'active';
    team.subscriptionRequestedPlan = planId;
    team.subscriptionRequestedInterval = interval;
    if (!isUpdate) {
      team.subscriptionStatus = 'pending';
    }
    team.subscriptionUpdatedAt = new Date();

    let checkout = checkoutPayload(planId, interval);
    if (checkout.ready) {
      checkout = await createPayPalCheckout({
        team,
        planId,
        interval,
        user: req.user
      });
      if (checkout.subscriptionId) {
        team.paypalSubscriptionId = checkout.subscriptionId;
      }
    }
    await team.save();

    res.status(200).json({
      message: checkout.url
        ? `Continue to PayPal for ${plan.label} (${price}, ${plan.limitLabel}).`
        : isUpdate
          ? `${plan.label} ${interval} update saved (${price}, ${plan.limitLabel}). ${checkout.message}`
          : `${plan.label} requested (${price}, ${plan.limitLabel}). ${checkout.message}`,
      activated: false,
      requestedPlan: planId,
      requestedInterval: interval,
      subscriptionStatus: team.subscriptionStatus,
      checkout
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

async function applyParsedPayPalEvent(parsed) {
  if (!parsed || !parsed.teamId) {
    const error = new Error('PayPal event is missing the team.');
    error.status = 400;
    throw error;
  }
  const team = await Team.findById(parsed.teamId);
  if (!team) {
    const error = new Error('Team not found.');
    error.status = 404;
    throw error;
  }

  if (parsed.status !== 'canceled' && !isPaidPlanId(parsed.plan)) {
    parsed.plan = team.subscriptionRequestedPlan || team.subscriptionPlan;
    parsed.interval = parsed.interval || team.subscriptionRequestedInterval || team.subscriptionInterval;
  }
  if (parsed.status !== 'canceled' && !isPaidPlanId(parsed.plan)) {
    const error = new Error('PayPal event is missing a Plus or Premium plan.');
    error.status = 400;
    throw error;
  }

  applySubscriptionToTeam(team, {
    ...parsed,
    status: parsed.status === 'canceled' || parsed.status === 'cancelled' ? 'canceled' : 'active'
  });
  await team.save();
  return team;
}

/**
 * @desc    Confirm a PayPal subscription after the coach returns from checkout
 * @route   POST /api/team/subscription/paypal-confirm
 */
const confirmPayPalSubscription = async (req, res) => {
  try {
    const subscriptionId = String(req.body.subscriptionId || req.query.subscription_id || '').trim();
    if (!subscriptionId) {
      return res.status(400).json({ error: 'PayPal did not return a subscription id.' });
    }
    if (!paypalReady()) {
      return res.status(503).json({ error: 'PayPal is not configured yet.' });
    }

    const team = await Team.findById(req.user.teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const subscription = await fetchPayPalSubscription(subscriptionId);
    const parsed = subscriptionToApplyPayload(subscription);
    if (parsed.teamId && String(parsed.teamId) !== String(team._id)) {
      return res.status(403).json({ error: 'This PayPal subscription belongs to a different team.' });
    }
    parsed.teamId = String(team._id);
    parsed.plan = parsed.plan || req.body.plan || team.subscriptionRequestedPlan;
    parsed.interval = parsed.interval || req.body.interval || team.subscriptionRequestedInterval || 'monthly';

    if (parsed.status !== 'active' && parsed.status !== 'canceled') {
      return res.status(200).json({
        ok: true,
        activated: false,
        message: 'PayPal is still confirming this subscription. Refresh Team Management in a moment.'
      });
    }

    const updated = await applyParsedPayPalEvent(parsed);
    res.status(200).json({
      ok: true,
      activated: updated.subscriptionStatus === 'active',
      teamId: String(updated._id),
      subscriptionPlan: updated.subscriptionPlan,
      subscriptionStatus: updated.subscriptionStatus
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

/**
 * @desc    PayPal webhook to activate or cancel a paid storage plan
 * @route   POST /api/billing/paypal-webhook
 */
const handlePayPalSubscriptionWebhook = async (req, res) => {
  try {
    if (!paypalReady()) {
      return res.status(503).json({ error: 'PayPal webhook is not configured yet.' });
    }

    const verified = await verifyPayPalWebhook(req);
    if (verified.skipped) {
      return res.status(503).json({
        error: 'PayPal webhook signature verification is not configured. Set PAYPAL_WEBHOOK_ID.'
      });
    }
    if (!verified.ok) {
      return res.status(401).json({ error: 'Invalid PayPal webhook signature.' });
    }

    const eventType = String(req.body?.event_type || req.body?.eventType || '').trim();
    if (!eventType) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    let parsed = parsePayPalSubscriptionEvent(req.body);
    if (parsed?.paypalSubscriptionId && (!parsed.plan || !parsed.teamId)) {
      const subscription = await fetchPayPalSubscription(parsed.paypalSubscriptionId);
      parsed = {
        ...subscriptionToApplyPayload(subscription),
        ...parsed,
        teamId: parsed.teamId || subscription.custom_id,
        plan: parsed.plan || subscriptionToApplyPayload(subscription).plan,
        interval: parsed.interval || subscriptionToApplyPayload(subscription).interval
      };
    }

    if (parsed && !parsed.teamId && parsed.paypalSubscriptionId) {
      const existing = await Team.findOne({ paypalSubscriptionId: parsed.paypalSubscriptionId });
      if (existing) parsed.teamId = String(existing._id);
    }

    if (!parsed || !parsed.teamId) {
      return res.status(200).json({ ok: true, ignored: true });
    }
    if (parsed.status !== 'active' && parsed.status !== 'canceled' && parsed.status !== 'cancelled') {
      return res.status(200).json({ ok: true, pending: true });
    }

    const team = await applyParsedPayPalEvent(parsed);
    res.status(200).json({
      ok: true,
      teamId: String(team._id),
      subscriptionPlan: team.subscriptionPlan,
      subscriptionStatus: team.subscriptionStatus
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

module.exports = {
  addPlayer,
  addCoach,
  getTeamMembers,
  assignPlayerToCoach,
  getTeamStorage,
  getTeamQuota,
  requestTeamSubscription,
  confirmPayPalSubscription,
  handlePayPalSubscriptionWebhook
};