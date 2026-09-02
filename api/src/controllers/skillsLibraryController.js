const Team = require('../models/Team');
const SubscriptionVideo = require('../models/SubscriptionVideo');
const SubscriptionPlaybook = require('../models/SubscriptionPlaybook');
const SubscriptionPlaybookBlock = require('../models/SubscriptionPlaybookBlock');
const { effectivePlan } = require('../utils/storagePlans');
const { skillsLibraryPayload, serializeSubscriptionPlaybook } = require('../utils/skillsLibrary');
const { hiddenSectionsMap, visibleSectionsFor } = require('../utils/playbookBlocks');
const { streamPlaybookBlockMedia, ensureOutlineBlocks } = require('./adminLibraryController');

async function requireUnlockedPlan(req) {
  if (!req.user.teamId) {
    const error = new Error('No team is associated with this account.');
    error.status = 400;
    throw error;
  }
  const team = await Team.findById(req.user.teamId).select('subscriptionPlan subscriptionStatus');
  if (!team) {
    const error = new Error('Team not found.');
    error.status = 404;
    throw error;
  }
  const plan = effectivePlan(team);
  if (!plan.skillsLibrary) {
    const error = new Error('A paid plan unlocks the skills library playbooks.');
    error.status = 403;
    throw error;
  }
  return plan;
}

const getSkillsLibrary = async (req, res) => {
  try {
    if (!req.user.teamId) {
      return res.status(400).json({ error: 'No team is associated with this account.' });
    }

    const team = await Team.findById(req.user.teamId).select(
      'subscriptionPlan subscriptionStatus'
    );
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const plan = effectivePlan(team);
    let videos = [];
    let playbooks = [];
    if (plan.skillsLibrary) {
      [videos, playbooks] = await Promise.all([
        SubscriptionVideo.find().sort({ topic: 1, level: 1, sortOrder: 1, createdAt: 1 }),
        SubscriptionPlaybook.find().sort({ sortOrder: 1, createdAt: 1 })
      ]);
    }

    res.status(200).json(skillsLibraryPayload(plan.skillsLibrary, plan, { videos, playbooks }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSubscriptionPlaybookView = async (req, res) => {
  try {
    await requireUnlockedPlan(req);
    const playbook = await SubscriptionPlaybook.findById(req.params.id);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }
    await ensureOutlineBlocks(playbook);
    const hidden = hiddenSectionsMap(playbook);
    const blocks = await SubscriptionPlaybookBlock.find({ playbookId: playbook._id })
      .sort({ section: 1, order: 1, createdAt: 1 });
    res.status(200).json({
      playbook: serializeSubscriptionPlaybook(playbook),
      blocks: blocks.filter((block) => !hidden[block.section]),
      sections: visibleSectionsFor(playbook)
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const streamSubscriptionPlaybookMedia = async (req, res) => {
  try {
    await requireUnlockedPlan(req);
    req.params.playbookId = req.params.id;
    return streamPlaybookBlockMedia(req, res);
  } catch (error) {
    if (res.headersSent) return;
    res.status(error.status || 500).json({ error: error.message });
  }
};

module.exports = {
  getSkillsLibrary,
  getSubscriptionPlaybookView,
  streamSubscriptionPlaybookMedia
};
