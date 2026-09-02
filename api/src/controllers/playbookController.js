const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Playbook = require('../models/Playbook');
const SECTIONS = Playbook.SECTIONS;
const PlaybookBlock = require('../models/PlaybookBlock');
const Team = require('../models/Team');
const { assertTeamCanUpload, incomingUploadBytes } = require('../utils/teamStorageUsage');
const { pipeStoredMedia } = require('../utils/localVideoStorage');
const {
  isR2Configured,
  deleteR2Object,
  uploadBufferToR2,
  playbookObjectKey,
  mediaExtensionForUpload
} = require('../utils/r2VideoStorage');

function getFrontendUrl() {
  const url = process.env.FRONTEND_URL?.split(',')[0]?.trim().replace(/\/$/, '');
  if (url) return url;
  if (process.env.PUBLIC_API_URL) {
    return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  }
  return '';
}

function shareUrlFor(shareToken) {
  const base = getFrontendUrl() || '';
  return `${base}/playbook.html?token=${shareToken}`;
}

function normalizeSectionOrder(order) {
  const seen = new Set();
  const result = [];
  if (Array.isArray(order)) {
    for (const key of order) {
      const section = String(key || '');
      if (SECTIONS.includes(section) && !seen.has(section)) {
        seen.add(section);
        result.push(section);
      }
    }
  }
  for (const key of SECTIONS) {
    if (!seen.has(key)) result.push(key);
  }
  return result;
}

function hiddenSectionsMap(playbook) {
  const map = {};
  for (const key of SECTIONS) {
    map[key] = Boolean(playbook?.hiddenSections?.[key]);
  }
  return map;
}

function orderedSectionsFor(playbook) {
  return normalizeSectionOrder(playbook?.sectionOrder);
}

function visibleSectionsFor(playbook) {
  const hidden = hiddenSectionsMap(playbook);
  return orderedSectionsFor(playbook).filter((key) => !hidden[key]);
}

function serializePlaybook(playbook) {
  return {
    _id: playbook._id,
    teamId: playbook.teamId,
    teamName: playbook.teamName,
    shareToken: playbook.shareToken,
    shareUrl: shareUrlFor(playbook.shareToken),
    sectionOrder: orderedSectionsFor(playbook),
    hiddenSections: hiddenSectionsMap(playbook),
    comingSoonDismissed: playbook.comingSoonDismissed,
    createdAt: playbook.createdAt,
    updatedAt: playbook.updatedAt
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({ text: String(item?.text || item || '').trim() }))
    .filter((item) => item.text)
    .slice(0, 20);
}

function buildBlockPayload(body = {}) {
  const payload = {
    title: String(body.title || '').trim(),
    subtitle: String(body.subtitle || '').trim(),
    body: String(body.body || '').trim(),
    items: normalizeItems(body.items),
    name: String(body.name || '').trim(),
    experience: String(body.experience || '').trim(),
    jobScope: String(body.jobScope || '').trim(),
    email: String(body.email || '').trim(),
    subsection: String(body.subsection || '').trim(),
    url: String(body.url || '').trim(),
    label: String(body.label || '').trim()
  };
  if (body.layoutType && ['vertical_box', 'radial', 'horizontal_hierarchy'].includes(body.layoutType)) {
    payload.layoutType = body.layoutType;
  }
  return payload;
}

async function findTeamPlaybook(req) {
  return Playbook.findOne({ teamId: req.user.teamId });
}

/**
 * @route GET /api/playbook/me
 */
const getMyPlaybook = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'No playbook yet.', exists: false });
    }
    res.status(200).json({ exists: true, playbook: serializePlaybook(playbook) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route GET /api/playbook/meta/:shareToken
 * Public metadata for password gate (no sensitive content)
 */
const getShareMeta = async (req, res) => {
  try {
    const playbook = await Playbook.findOne({ shareToken: req.params.shareToken }).select('teamName shareToken');
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }
    res.status(200).json({ teamName: playbook.teamName, shareToken: playbook.shareToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route POST /api/playbook
 */
const createPlaybook = async (req, res) => {
  try {
    if (!req.user.teamId) {
      return res.status(400).json({ error: 'You must belong to a team.' });
    }

    const existing = await findTeamPlaybook(req);
    if (existing) {
      return res.status(400).json({ error: 'Your team already has a playbook.' });
    }

    const password = String(req.body.password || '').trim();
    if (password.length < 4) {
      return res.status(400).json({ error: 'Playbook password must be at least 4 characters.' });
    }

    const team = await Team.findById(req.user.teamId);
    const teamName = team?.name || req.user.teamName || 'Team';
    const passwordHash = await bcrypt.hash(password, 10);
    const shareToken = crypto.randomBytes(24).toString('hex');

    const playbook = await Playbook.create({
      teamId: req.user.teamId,
      teamName,
      passwordHash,
      shareToken,
      createdBy: req.user._id
    });

    res.status(201).json({
      message: 'Playbook created.',
      playbook: serializePlaybook(playbook)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route PATCH /api/playbook/password
 */
const updatePlaybookPassword = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const password = String(req.body.password || '').trim();
    if (password.length < 4) {
      return res.status(400).json({ error: 'Playbook password must be at least 4 characters.' });
    }

    playbook.passwordHash = await bcrypt.hash(password, 10);
    await playbook.save();

    res.status(200).json({ message: 'Playbook password updated.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route POST /api/playbook/access
 */
const accessPlaybook = async (req, res) => {
  try {
    const shareToken = String(req.body.shareToken || '').trim();
    const password = String(req.body.password || '');
    if (!shareToken || !password) {
      return res.status(400).json({ error: 'Share token and password are required.' });
    }

    const playbook = await Playbook.findOne({ shareToken });
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const ok = await bcrypt.compare(password, playbook.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect playbook password.' });
    }

    const viewToken = jwt.sign(
      {
        type: 'playbook_view',
        playbookId: String(playbook._id),
        shareToken: playbook.shareToken
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.status(200).json({
      message: 'Access granted.',
      viewToken,
      playbook: serializePlaybook(playbook)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route GET /api/playbook/editor
 */
const getEditorContent = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(200).json({ exists: false, playbook: null, blocks: [], sections: SECTIONS });
    }

    const sections = orderedSectionsFor(playbook);
    const blocks = await PlaybookBlock.find({ playbookId: playbook._id }).sort({ section: 1, order: 1, createdAt: 1 });
    res.status(200).json({
      exists: true,
      playbook: serializePlaybook(playbook),
      blocks,
      sections
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route GET /api/playbook/view
 * Requires playbookViewAuth
 */
const getPublicContent = async (req, res) => {
  try {
    const playbook = req.playbook;
    const sections = visibleSectionsFor(playbook);
    const hidden = hiddenSectionsMap(playbook);
    const blocks = await PlaybookBlock.find({ playbookId: playbook._id }).sort({ section: 1, order: 1, createdAt: 1 });
    const visibleBlocks = blocks.filter((block) => !hidden[block.section]);
    res.status(200).json({
      playbook: serializePlaybook(playbook),
      blocks: visibleBlocks,
      sections
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route PATCH /api/playbook/sections
 * Head coach: update section order and/or visibility
 */
const updateSections = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    if (req.body.sectionOrder != null) {
      if (!Array.isArray(req.body.sectionOrder)) {
        return res.status(400).json({ error: 'sectionOrder must be an array of section keys.' });
      }
      playbook.sectionOrder = normalizeSectionOrder(req.body.sectionOrder);
    }

    if (req.body.hiddenSections != null) {
      if (typeof req.body.hiddenSections !== 'object' || Array.isArray(req.body.hiddenSections)) {
        return res.status(400).json({ error: 'hiddenSections must be an object of section flags.' });
      }
      if (!playbook.hiddenSections) {
        playbook.hiddenSections = {};
      }
      for (const key of SECTIONS) {
        if (Object.prototype.hasOwnProperty.call(req.body.hiddenSections, key)) {
          playbook.hiddenSections[key] = Boolean(req.body.hiddenSections[key]);
        }
      }
      playbook.markModified('hiddenSections');
    }

    await playbook.save();

    res.status(200).json({
      message: 'Sections updated.',
      playbook: serializePlaybook(playbook)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route POST /api/playbook/blocks
 */
const createBlock = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const section = String(req.body.section || '');
    if (!SECTIONS.includes(section)) {
      return res.status(400).json({ error: 'Invalid section.' });
    }

    const count = await PlaybookBlock.countDocuments({ playbookId: playbook._id, section });
    const payload = buildBlockPayload(req.body);

    if (section === 'backbone_pillars' && payload.layoutType
      && !['vertical_box', 'radial', 'horizontal_hierarchy'].includes(payload.layoutType)) {
      return res.status(400).json({ error: 'Invalid backbone layout.' });
    }

    if (section === 'links' && payload.url) {
      const withProtocol = /^https?:\/\//i.test(payload.url) ? payload.url : `https://${payload.url}`;
      try {
        const parsed = new URL(withProtocol);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return res.status(400).json({ error: 'Enter a valid http or https link.' });
        }
        payload.url = parsed.href;
      } catch (_) {
        return res.status(400).json({ error: 'Enter a valid http or https link.' });
      }
      if (!payload.label) payload.label = payload.url;
    }

    const block = await PlaybookBlock.create({
      playbookId: playbook._id,
      section,
      order: count,
      ...payload
    });

    res.status(201).json({ message: 'Section created.', block });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route PATCH /api/playbook/blocks/:id
 */
const updateBlock = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const block = await PlaybookBlock.findOne({ _id: req.params.id, playbookId: playbook._id });
    if (!block) {
      return res.status(404).json({ error: 'Section not found.' });
    }

    const payload = buildBlockPayload({ ...block.toObject(), ...req.body });
    Object.assign(block, payload);
    if (req.body.order != null) block.order = Number(req.body.order) || 0;
    await block.save();

    res.status(200).json({ message: 'Section updated.', block });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route DELETE /api/playbook/blocks/:id
 */
const deleteBlock = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const block = await PlaybookBlock.findOne({ _id: req.params.id, playbookId: playbook._id });
    if (!block) {
      return res.status(404).json({ error: 'Section not found.' });
    }

    if (block.r2ObjectKey) {
      try {
        await deleteR2Object(block.r2ObjectKey);
      } catch (_) { /* ignore missing file */ }
    }

    await block.deleteOne();
    res.status(200).json({ message: 'Section deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route PATCH /api/playbook/coming-soon
 */
const dismissComingSoon = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const section = String(req.body.section || '');
    if (!SECTIONS.includes(section)) {
      return res.status(400).json({ error: 'Invalid section.' });
    }

    playbook.comingSoonDismissed[section] = true;
    await playbook.save();

    res.status(200).json({
      message: 'Coming Soon removed.',
      comingSoonDismissed: playbook.comingSoonDismissed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @route POST /api/playbook/blocks/:id/media
 */
const uploadBlockMedia = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    const block = await PlaybookBlock.findOne({ _id: req.params.id, playbookId: playbook._id });
    if (!block) {
      return res.status(404).json({ error: 'Section not found.' });
    }

    if (!['systems', 'base_knowledge'].includes(block.section)) {
      return res.status(400).json({ error: 'Media can only be added to Systems or Base Knowledge sections.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      await assertTeamCanUpload(req.user.teamId, incomingUploadBytes(req.file));
    } catch (quotaErr) {
      return res.status(quotaErr.status || 403).json({
        error: quotaErr.message,
        code: quotaErr.code || 'STORAGE_LIMIT'
      });
    }

    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Cloudflare R2 is not configured on this server.' });
    }

    if (block.r2ObjectKey) {
      try {
        await deleteR2Object(block.r2ObjectKey);
      } catch (_) { /* ignore */ }
    }

    const ext = mediaExtensionForUpload(req.file);
    const objectKey = playbookObjectKey(req.user.teamId, block._id, ext);
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Stream playbook media — accepts app JWT, playbook view JWT, or ?token=
 * @route GET /api/playbook/media/:blockId
 */
const streamBlockMedia = async (req, res) => {
  try {
    const block = await PlaybookBlock.findById(req.params.blockId);
    if (!block || !String(block.r2ObjectKey || '').trim()) {
      return res.status(404).json({ error: 'Media not found.' });
    }

    const playbook = await Playbook.findById(block.playbookId);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found.' });
    }

    let allowed = false;

    // App user JWT (head coach / coach on same team)
    if (req.user && String(req.user.teamId) === String(playbook.teamId)) {
      allowed = true;
    }

    // Playbook view token (no media from sections hidden on the share link)
    let viaViewToken = false;
    if (!allowed && req.playbook && String(req.playbook._id) === String(playbook._id)) {
      allowed = true;
      viaViewToken = true;
    }

    // Try query/header token as playbook view if not yet allowed
    if (!allowed) {
      let token;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      } else if (req.query.token) {
        token = req.query.token;
      }
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded.type === 'playbook_view'
            && String(decoded.playbookId) === String(playbook._id)
            && decoded.shareToken === playbook.shareToken) {
            allowed = true;
            viaViewToken = true;
          } else if (decoded.id) {
            const User = require('../models/User');
            const user = await User.findById(decoded.id).select('teamId');
            if (user && String(user.teamId) === String(playbook.teamId)) {
              allowed = true;
            }
          }
        } catch (_) { /* ignore */ }
      }
    }

    if (!allowed) {
      return res.status(401).json({ error: 'Not authorized to view this media.' });
    }

    if (viaViewToken && hiddenSectionsMap(playbook)[block.section]) {
      return res.status(404).json({ error: 'Media not found.' });
    }

    if (await pipeStoredMedia(block, req, res)) {
      return;
    }
    return res.status(404).json({ error: 'Media file not found in storage.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Coach with JWT: resolve own team's share token for password gate
 * @route GET /api/playbook/team-share
 */
const getTeamShareToken = async (req, res) => {
  try {
    const playbook = await findTeamPlaybook(req);
    if (!playbook) {
      return res.status(404).json({ error: 'No playbook yet.', exists: false });
    }
    res.status(200).json({
      exists: true,
      shareToken: playbook.shareToken,
      teamName: playbook.teamName,
      shareUrl: shareUrlFor(playbook.shareToken)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyPlaybook,
  getShareMeta,
  createPlaybook,
  updatePlaybookPassword,
  accessPlaybook,
  getEditorContent,
  getPublicContent,
  updateSections,
  createBlock,
  updateBlock,
  deleteBlock,
  dismissComingSoon,
  uploadBlockMedia,
  streamBlockMedia,
  getTeamShareToken
};
