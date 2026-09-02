const Team = require('../models/Team');
const User = require('../models/User');
const Video = require('../models/Video');
const Assignment = require('../models/Assignment');
const Goal = require('../models/Goal');
const CoachNote = require('../models/CoachNote');
const PlayerNote = require('../models/PlayerNote');
const WhiteboardItem = require('../models/WhiteboardItem');
const Playbook = require('../models/Playbook');
const PlaybookBlock = require('../models/PlaybookBlock');
const { sumTeamR2Usage } = require('./r2VideoStorage');
const {
  effectivePlan,
  effectiveInterval,
  priceLabel,
  formatBytes,
  canAcceptUpload,
  storageLimitError,
  incomingUploadBytes
} = require('./storagePlans');

async function sumDocumentBytes(Model, filter) {
  const rows = await Model.find(filter).lean();
  const bytes = rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row)), 0);
  return { bytes, count: rows.length };
}

function quotaPayload(team, totalBytes) {
  const plan = effectivePlan(team);
  const usedBytes = Math.max(0, Number(totalBytes) || 0);
  const remainingBytes = Math.max(0, plan.limitBytes - usedBytes);
  const usedPercent = plan.limitBytes > 0
    ? Math.min(100, Math.round((usedBytes / plan.limitBytes) * 1000) / 10)
    : 0;

  return {
    plan: plan.id,
    planLabel: plan.label,
    interval: effectiveInterval(team),
    monthlyLabel: plan.monthlyLabel,
    yearlyLabel: plan.yearlyLabel,
    priceLabel: priceLabel(plan, effectiveInterval(team)),
    skillsLibrary: plan.skillsLibrary,
    limitBytes: plan.limitBytes,
    limitLabel: plan.limitLabel,
    usedBytes,
    usedLabel: formatBytes(usedBytes),
    remainingBytes,
    remainingLabel: formatBytes(remainingBytes),
    usedPercent,
    canUpload: canAcceptUpload(usedBytes, plan.limitBytes, 1),
    subscriptionStatus: team.subscriptionStatus || 'inactive',
    requestedPlan: team.subscriptionRequestedPlan || null,
    requestedInterval: team.subscriptionRequestedInterval || null
  };
}

async function computeTeamStorage(teamId) {
  if (!teamId) {
    const error = new Error('No team is associated with this account.');
    error.status = 400;
    throw error;
  }

  const teamIdStr = String(teamId);
  const team = await Team.findById(teamId);

  if (!team) {
    const error = new Error('Team not found.');
    error.status = 404;
    throw error;
  }

  const playbook = await Playbook.findOne({ teamId }).select('_id');
  const documentMatches = [
    sumDocumentBytes(Team, { _id: team._id }),
    sumDocumentBytes(User, { teamId: team._id }),
    sumDocumentBytes(Video, { teamId: team._id }),
    sumDocumentBytes(Assignment, { teamId: team._id }),
    sumDocumentBytes(Goal, { teamId: team._id }),
    sumDocumentBytes(CoachNote, { teamId: team._id }),
    sumDocumentBytes(PlayerNote, { teamId: team._id }),
    sumDocumentBytes(WhiteboardItem, { teamId: team._id }),
    sumDocumentBytes(Playbook, { teamId: team._id })
  ];
  if (playbook) {
    documentMatches.push(sumDocumentBytes(PlaybookBlock, { playbookId: playbook._id }));
  }

  const [r2Usage, ...documentParts] = await Promise.all([
    sumTeamR2Usage(teamIdStr),
    ...documentMatches
  ]);

  const documentsBytes = documentParts.reduce((sum, part) => sum + part.bytes, 0);
  const r2Bytes = r2Usage.bytes || 0;
  const totalBytes = documentsBytes + r2Bytes;
  const quota = quotaPayload(team, totalBytes);

  return {
    team,
    teamId: teamIdStr,
    teamName: team.name,
    totalBytes,
    totalLabel: formatBytes(totalBytes),
    r2Bytes,
    r2Label: formatBytes(r2Bytes),
    r2ObjectCount: r2Usage.objectCount || 0,
    r2Configured: Boolean(r2Usage.configured),
    databaseBytes: documentsBytes,
    databaseLabel: formatBytes(documentsBytes),
    videoFilesBytes: r2Bytes,
    videoFilesLabel: formatBytes(r2Bytes),
    videoFileCount: r2Usage.objectCount || 0,
    playbookFilesBytes: 0,
    playbookFilesLabel: formatBytes(0),
    playbookFileCount: 0,
    documentsBytes,
    documentsLabel: formatBytes(documentsBytes),
    ...quota
  };
}

async function assertTeamCanUpload(teamId, extraBytes = 0) {
  const usage = await computeTeamStorage(teamId);
  const plan = effectivePlan(usage.team);
  if (!canAcceptUpload(usage.usedBytes, plan.limitBytes, extraBytes)) {
    const error = new Error(storageLimitError(plan, usage.usedBytes, extraBytes));
    error.status = 403;
    error.code = 'STORAGE_LIMIT';
    throw error;
  }
  return usage;
}

module.exports = {
  computeTeamStorage,
  assertTeamCanUpload,
  quotaPayload,
  incomingUploadBytes
};
