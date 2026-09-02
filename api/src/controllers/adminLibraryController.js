const SubscriptionVideo = require('../models/SubscriptionVideo');
const SubscriptionPlaybook = require('../models/SubscriptionPlaybook');
const SubscriptionPlaybookBlock = require('../models/SubscriptionPlaybookBlock');
const { normalizeYouTubeUrl } = require('../utils/youtubeUrl');
const { pipeStoredMedia } = require('../utils/localVideoStorage');
const {
  isR2Configured,
  deleteR2Object,
  uploadBufferToR2,
  subscriptionPlaybookObjectKey,
  mediaExtensionForUpload
} = require('../utils/r2VideoStorage');
const {
  SECTIONS,
  normalizeSectionOrder,
  hiddenSectionsMap,
  applyHiddenSections,
  orderedSectionsFor,
  buildBlockPayload,
  normalizeHttpUrl
} = require('../utils/playbookBlocks');
const {
  TOPIC_IDS,
  PLAYBOOK_CATEGORY_IDS,
  serializeSubscriptionVideo,
  serializeSubscriptionPlaybook,
  normalizeSkillLevel,
  sortSkillVideos
} = require('../utils/skillsLibrary');

const CATEGORY_SUBSECTION = {
  breakout: 'Breakouts',
  forecheck: 'Forecheck',
  'neutral-zone': 'Neutral Zone',
  'power-play': 'Powerplay',
  'penalty-kill': 'Penalty Kill',
  'offensive-zone': 'O-Zone',
  'defensive-zone': 'D-Zone'
};

async function findSubscriptionPlaybook(req) {
  return SubscriptionPlaybook.findById(req.params.id || req.params.playbookId);
}

async function ensureOutlineBlocks(playbook) {
  const existing = await SubscriptionPlaybookBlock.countDocuments({ playbookId: playbook._id });
  if (existing) return;
  const outline = (playbook.outline || []).map((line) => String(line || '').trim()).filter(Boolean);
  if (!outline.length && !playbook.summary) return;
  await SubscriptionPlaybookBlock.create({
    playbookId: playbook._id,
    section: 'systems',
    title: playbook.title,
    subsection: CATEGORY_SUBSECTION[playbook.category] || '',
    body: outline.length ? outline.join('\n') : playbook.summary,
    order: 0
  });
}

async function deleteSubscriptionPlaybookMedia(block) {
  if (!block?.r2ObjectKey) return;
  try {
    await deleteR2Object(block.r2ObjectKey);
  } catch (_) { /* ignore missing file */ }
}

function parseOutline(value) {
  if (Array.isArray(value)) {
    return value.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof value === 'string') {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  }
  return [];
}

function videoFields(body = {}) {
  const title = String(body.title || '').trim();
  const topic = String(body.topic || '').trim();
  const description = String(body.description || '').trim();
  const url = normalizeYouTubeUrl(body.url);
  const level = normalizeSkillLevel(body.level, { required: true });
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

  if (!title) {
    const error = new Error('A video title is required.');
    error.status = 400;
    throw error;
  }
  if (!TOPIC_IDS.includes(topic)) {
    const error = new Error('Choose a video topic from the skills library list.');
    error.status = 400;
    throw error;
  }
  if (!url) {
    const error = new Error('A valid YouTube URL is required.');
    error.status = 400;
    throw error;
  }

  return { title, topic, url, description, level, sortOrder };
}

function playbookFields(body = {}, { requireTitle = true } = {}) {
  const title = String(body.title || '').trim();
  const category = String(body.category || '').trim();
  const summary = String(body.summary || '').trim();
  const outline = parseOutline(body.outline);
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

  if (requireTitle && !title) {
    const error = new Error('A playbook title is required.');
    error.status = 400;
    throw error;
  }
  if (category && !PLAYBOOK_CATEGORY_IDS.includes(category)) {
    const error = new Error('Choose a playbook category from the preset list.');
    error.status = 400;
    throw error;
  }

  return { title, category, summary, outline, sortOrder };
}

const listVideos = async (req, res) => {
  const videos = await SubscriptionVideo.find().sort({ topic: 1, level: 1, sortOrder: 1, createdAt: 1 });
  res.status(200).json({ videos: sortSkillVideos(videos.map(serializeSubscriptionVideo)) });
};

const createVideo = async (req, res) => {
  const fields = videoFields(req.body);
  const video = await SubscriptionVideo.create({
    ...fields,
    createdBy: req.user._id
  });
  res.status(201).json({ video: serializeSubscriptionVideo(video) });
};

const updateVideo = async (req, res) => {
  const video = await SubscriptionVideo.findById(req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Subscription video not found.' });
  }
  const fields = videoFields({
    title: req.body.title ?? video.title,
    topic: req.body.topic ?? video.topic,
    url: req.body.url ?? video.url,
    description: req.body.description ?? video.description,
    level: req.body.level ?? video.level ?? 1,
    sortOrder: req.body.sortOrder ?? video.sortOrder
  });
  Object.assign(video, fields);
  await video.save();
  res.status(200).json({ video: serializeSubscriptionVideo(video) });
};

const deleteVideo = async (req, res) => {
  const video = await SubscriptionVideo.findByIdAndDelete(req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Subscription video not found.' });
  }
  res.status(200).json({ ok: true });
};

const listPlaybooks = async (req, res) => {
  const playbooks = await SubscriptionPlaybook.find().sort({ sortOrder: 1, createdAt: 1 });
  res.status(200).json({ playbooks: playbooks.map(serializeSubscriptionPlaybook) });
};

const createPlaybook = async (req, res) => {
  const fields = playbookFields(req.body);
  if (!fields.category) {
    return res.status(400).json({ error: 'Choose a playbook category from the preset list.' });
  }
  const playbook = await SubscriptionPlaybook.create({
    ...fields,
    createdBy: req.user._id
  });
  res.status(201).json({ playbook: serializeSubscriptionPlaybook(playbook) });
};

const updatePlaybook = async (req, res) => {
  const playbook = await SubscriptionPlaybook.findById(req.params.id);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const fields = playbookFields({
    title: req.body.title ?? playbook.title,
    category: req.body.category ?? playbook.category,
    summary: req.body.summary ?? playbook.summary,
    outline: req.body.outline ?? playbook.outline,
    sortOrder: req.body.sortOrder ?? playbook.sortOrder
  });
  if (!fields.category) {
    return res.status(400).json({ error: 'Choose a playbook category from the preset list.' });
  }
  Object.assign(playbook, fields);
  await playbook.save();
  res.status(200).json({ playbook: serializeSubscriptionPlaybook(playbook) });
};

const deletePlaybook = async (req, res) => {
  const playbook = await SubscriptionPlaybook.findById(req.params.id);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const blocks = await SubscriptionPlaybookBlock.find({ playbookId: playbook._id });
  await Promise.all(blocks.map(deleteSubscriptionPlaybookMedia));
  await SubscriptionPlaybookBlock.deleteMany({ playbookId: playbook._id });
  await playbook.deleteOne();
  res.status(200).json({ ok: true });
};

const getPlaybookEditor = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.', exists: false });
  }
  await ensureOutlineBlocks(playbook);
  const blocks = await SubscriptionPlaybookBlock.find({ playbookId: playbook._id })
    .sort({ section: 1, order: 1, createdAt: 1 });
  res.status(200).json({
    exists: true,
    playbook: serializeSubscriptionPlaybook(playbook),
    blocks,
    sections: orderedSectionsFor(playbook)
  });
};

const updatePlaybookSections = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const $set = {};
  if (req.body.sectionOrder != null) {
    if (!Array.isArray(req.body.sectionOrder)) {
      return res.status(400).json({ error: 'sectionOrder must be an array of section keys.' });
    }
    playbook.sectionOrder = normalizeSectionOrder(req.body.sectionOrder);
    $set.sectionOrder = playbook.sectionOrder;
  }
  if (req.body.hiddenSections != null) {
    if (typeof req.body.hiddenSections !== 'object' || Array.isArray(req.body.hiddenSections)) {
      return res.status(400).json({ error: 'hiddenSections must be an object of section flags.' });
    }
    $set.hiddenSections = applyHiddenSections(playbook, req.body.hiddenSections);
  }
  if (Object.keys($set).length) {
    // Partial $set so an invalid legacy category (e.g. "Passive") does not block hide/reorder.
    await SubscriptionPlaybook.updateOne({ _id: playbook._id }, { $set });
  }
  res.status(200).json({
    message: 'Sections updated.',
    playbook: serializeSubscriptionPlaybook(playbook)
  });
};

const dismissPlaybookComingSoon = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const section = String(req.body.section || '');
  if (!SECTIONS.includes(section)) {
    return res.status(400).json({ error: 'Invalid section.' });
  }
  if (!playbook.comingSoonDismissed) playbook.comingSoonDismissed = {};
  playbook.comingSoonDismissed[section] = true;
  playbook.markModified('comingSoonDismissed');
  await SubscriptionPlaybook.updateOne(
    { _id: playbook._id },
    { $set: { [`comingSoonDismissed.${section}`]: true } }
  );
  res.status(200).json({
    message: 'Coming Soon removed.',
    comingSoonDismissed: playbook.comingSoonDismissed
  });
};

const createPlaybookBlock = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const section = String(req.body.section || '');
  if (!SECTIONS.includes(section)) {
    return res.status(400).json({ error: 'Invalid section.' });
  }
  const count = await SubscriptionPlaybookBlock.countDocuments({ playbookId: playbook._id, section });
  const payload = buildBlockPayload(req.body);
  if (section === 'links' && payload.url) {
    const parsed = normalizeHttpUrl(payload.url);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    payload.url = parsed.url;
    if (!payload.label) payload.label = payload.url;
  }
  const block = await SubscriptionPlaybookBlock.create({
    playbookId: playbook._id,
    section,
    order: count,
    ...payload
  });
  res.status(201).json({ message: 'Section created.', block });
};

const deletePlaybookBlock = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const block = await SubscriptionPlaybookBlock.findOne({
    _id: req.params.blockId,
    playbookId: playbook._id
  });
  if (!block) {
    return res.status(404).json({ error: 'Section not found.' });
  }
  await deleteSubscriptionPlaybookMedia(block);
  await block.deleteOne();
  res.status(200).json({ message: 'Section deleted.' });
};

const uploadPlaybookBlockMedia = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const block = await SubscriptionPlaybookBlock.findOne({
    _id: req.params.blockId,
    playbookId: playbook._id
  });
  if (!block) {
    return res.status(404).json({ error: 'Section not found.' });
  }
  if (!['systems', 'base_knowledge'].includes(block.section)) {
    return res.status(400).json({ error: 'Media can only be added to Systems or Base Knowledge sections.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  if (!isR2Configured()) {
    return res.status(503).json({ error: 'Cloudflare R2 is not configured on this server.' });
  }
  await deleteSubscriptionPlaybookMedia(block);
  const ext = mediaExtensionForUpload(req.file);
  const objectKey = subscriptionPlaybookObjectKey(playbook._id, block._id, ext);
  await uploadBufferToR2({
    key: objectKey,
    body: req.file.buffer,
    contentType: req.file.mimetype
  });
  block.r2ObjectKey = objectKey;
  block.gridFsId = null;
  block.mimeType = req.file.mimetype;
  block.originalFilename = req.file.originalname;
  block.mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
  await block.save();
  res.status(200).json({ message: 'Media uploaded.', block });
};

const streamPlaybookBlockMedia = async (req, res) => {
  const playbook = await findSubscriptionPlaybook(req);
  if (!playbook) {
    return res.status(404).json({ error: 'Subscription playbook not found.' });
  }
  const block = await SubscriptionPlaybookBlock.findOne({
    _id: req.params.blockId,
    playbookId: playbook._id
  });
  if (!block || !String(block.r2ObjectKey || '').trim()) {
    return res.status(404).json({ error: 'Media not found.' });
  }
  const hidden = hiddenSectionsMap(playbook);
  if (hidden[block.section] && req.user?.role !== 'ADMIN' && !req.user?.isPlatformAdmin) {
    return res.status(404).json({ error: 'Media not found.' });
  }
  if (await pipeStoredMedia(block, req, res)) {
    return;
  }
  return res.status(404).json({ error: 'Media not found.' });
};

const getAdminCatalog = async (req, res) => {
  const { TOPICS, PLAYBOOK_CATEGORIES, SKILL_LEVELS } = require('../utils/skillsLibrary');
  res.status(200).json({
    user: {
      id: String(req.user._id),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    },
    topics: TOPICS,
    playbookCategories: PLAYBOOK_CATEGORIES,
    skillLevels: SKILL_LEVELS
  });
};

module.exports = {
  listVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  listPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  getAdminCatalog,
  getPlaybookEditor,
  updatePlaybookSections,
  dismissPlaybookComingSoon,
  createPlaybookBlock,
  deletePlaybookBlock,
  uploadPlaybookBlockMedia,
  streamPlaybookBlockMedia,
  ensureOutlineBlocks
};
