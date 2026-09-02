const TOPICS = [
  { id: 'skating', title: 'Skating' },
  { id: 'edgework', title: 'Edgework' },
  { id: 'stickhandling', title: 'Stickhandling' },
  { id: 'shooting', title: 'Shooting' },
  { id: 'goalies', title: 'Goalies' },
  { id: 'systems', title: 'Systems' },
  { id: 'strategy', title: 'Strategy' },
  { id: 'coaching-tips', title: 'Coaching tips' }
];

const PLAYBOOK_CATEGORIES = [
  { id: 'breakout', title: 'Breakout' },
  { id: 'forecheck', title: 'Forecheck' },
  { id: 'neutral-zone', title: 'Neutral zone' },
  { id: 'power-play', title: 'Power play' },
  { id: 'penalty-kill', title: 'Penalty kill' },
  { id: 'faceoffs', title: 'Faceoffs' },
  { id: 'offensive-zone', title: 'Offensive zone' },
  { id: 'defensive-zone', title: 'Defensive zone' }
];

const TOPIC_IDS = TOPICS.map((topic) => topic.id);
const PLAYBOOK_CATEGORY_IDS = PLAYBOOK_CATEGORIES.map((category) => category.id);
const SKILL_LEVELS = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  title: `Level ${index + 1}`
}));
const SKILL_LEVEL_IDS = SKILL_LEVELS.map((level) => level.id);

function topicTitle(topicId) {
  return TOPICS.find((topic) => topic.id === topicId)?.title || topicId || '';
}

function normalizeSkillLevel(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      const error = new Error('Choose a skill level from 1 to 10.');
      error.status = 400;
      throw error;
    }
    return 1;
  }
  const level = Number(value);
  if (!Number.isInteger(level) || !SKILL_LEVEL_IDS.includes(level)) {
    const error = new Error('Choose a skill level from 1 to 10.');
    error.status = 400;
    throw error;
  }
  return level;
}

function skillLevelOf(videoOrLevel) {
  try {
    return normalizeSkillLevel(
      videoOrLevel && typeof videoOrLevel === 'object' ? videoOrLevel.level : videoOrLevel
    );
  } catch {
    return 1;
  }
}

function skillLevelTitle(level) {
  return `Level ${skillLevelOf(level)}`;
}

function compareSkillVideos(a, b) {
  const topicA = TOPIC_IDS.indexOf(a.topic);
  const topicB = TOPIC_IDS.indexOf(b.topic);
  const topicOrderA = topicA === -1 ? TOPIC_IDS.length : topicA;
  const topicOrderB = topicB === -1 ? TOPIC_IDS.length : topicB;
  if (topicOrderA !== topicOrderB) return topicOrderA - topicOrderB;

  const levelA = skillLevelOf(a);
  const levelB = skillLevelOf(b);
  if (levelA !== levelB) return levelA - levelB;

  const sortA = Number(a.sortOrder) || 0;
  const sortB = Number(b.sortOrder) || 0;
  if (sortA !== sortB) return sortA - sortB;

  return String(a.title || '').localeCompare(String(b.title || ''));
}

function sortSkillVideos(videos) {
  return [...videos].sort(compareSkillVideos);
}

const PRESET_PLAYBOOKS = [
  {
    presetKey: 'breakout',
    category: 'breakout',
    title: 'Breakout',
    summary: 'Get the puck out of the defensive zone with structure and support.',
    outline: [
      'Weak-side D retrieves and scans before the first touch',
      'Strong-side winger offers a wall outlet; weak-side winger stays high',
      'Center provides middle support and an option through the seam',
      'First pass is north — chip if the wall is covered',
      'F forwards skate into ice after the exit, not before it'
    ],
    sortOrder: 10
  },
  {
    presetKey: 'forecheck',
    category: 'forecheck',
    title: 'Forecheck',
    summary: 'Pressure the other team’s retrieval and force a rushed first pass.',
    outline: [
      'F1 takes an inside-out angle on the puck carrier',
      'F2 reads the next pass and takes away the wall or middle',
      'F3 stays high as the first layer of backpressure',
      'D hold the blue line until the puck is clearly coming out',
      'If they beat the first layer, collapse to a 2-1-2 middle'
    ],
    sortOrder: 20
  },
  {
    presetKey: 'neutral-zone',
    category: 'neutral-zone',
    title: 'Neutral zone',
    summary: 'Control the middle of the ice so entries are earned, not given.',
    outline: [
      'Forwards stay connected — no one below the far dots without support',
      'Center is the first defender through the middle',
      'D gap up early and take away the speed lane',
      'Deny the easy rim; force a dump or a contested blue-line entry',
      'Once we recover it, the first look is a controlled exit, not a chip-and-chase every time'
    ],
    sortOrder: 30
  },
  {
    presetKey: 'power-play',
    category: 'power-play',
    title: 'Power play',
    summary: 'Move the penalty killers, then attack the seam they leave behind.',
    outline: [
      'Set a 1-3-1 or overload and hold shape before the first shot',
      'Bumper and net-front stay available on every rim',
      'One-touch the weak side when the box slides',
      'Low play: retrieve, protect, and look bumper before a hope shot',
      'If they pressure the point, drop it down and attack downhill'
    ],
    sortOrder: 40
  },
  {
    presetKey: 'penalty-kill',
    category: 'penalty-kill',
    title: 'Penalty kill',
    summary: 'Stay connected, take away the middle, and clear with a purpose.',
    outline: [
      'Box or diamond stays tight — sticks in passing lanes, not chasing',
      'Pressure the puck only when it is on the wall or a bad touch',
      'Net-front D boxes out before the shot, not after',
      'First clear is high and off glass unless a skate-out is clean',
      'Change after a clear so the next shift starts with fresh pressure'
    ],
    sortOrder: 50
  },
  {
    presetKey: 'faceoffs',
    category: 'faceoffs',
    title: 'Faceoffs',
    summary: 'Win the draw or win the next race. Have a plan for both.',
    outline: [
      'Center sets a simple win: strong-side back, weak-side winger support',
      'Wingers jump the lane they are assigned — do not freelance',
      'D are ready for a lost draw before the puck is dropped',
      'Offensive-zone: one play to the net, one play to the point',
      'If we lose it, the first job is to stop their exit, not chase the puck'
    ],
    sortOrder: 60
  },
  {
    presetKey: 'offensive-zone',
    category: 'offensive-zone',
    title: 'Offensive zone',
    summary: 'Cycle with purpose and keep a threat at the net.',
    outline: [
      'Puck below the goal line with a net-front and a high support',
      'Low-to-high only when the point is open and the shot has traffic',
      'Weak-side winger stays available for a bump, not parked on the wall',
      'D activate late, not at the same time as the cycle',
      'If we lose it, the first forward back is already identified'
    ],
    sortOrder: 70
  },
  {
    presetKey: 'defensive-zone',
    category: 'defensive-zone',
    title: 'Defensive zone',
    summary: 'Protect the house first, then win the next retrieval.',
    outline: [
      'Net-front is never empty — one D or a collapsing forward',
      'Strong-side pressure, weak-side support',
      'Sticks on the ice in the slot; body on the cycle',
      'Win the inside position before you win the puck',
      'Once we have it, play the breakout instead of icing it out of panic'
    ],
    sortOrder: 80
  }
];

function serializeSubscriptionVideo(video) {
  if (!video) return null;
  const level = skillLevelOf(video);
  return {
    id: String(video._id || video.id),
    title: video.title,
    topic: video.topic,
    topicTitle: topicTitle(video.topic),
    level,
    levelTitle: skillLevelTitle(level),
    url: video.url,
    description: video.description || '',
    sortOrder: video.sortOrder || 0
  };
}

function serializeSubscriptionPlaybook(playbook) {
  if (!playbook) return null;
  const { orderedSectionsFor, hiddenSectionsMap } = require('./playbookBlocks');
  return {
    id: String(playbook._id || playbook.id),
    _id: playbook._id || playbook.id,
    title: playbook.title,
    teamName: playbook.title,
    category: playbook.category,
    summary: playbook.summary || '',
    outline: Array.isArray(playbook.outline) ? playbook.outline : [],
    sectionOrder: orderedSectionsFor(playbook),
    hiddenSections: hiddenSectionsMap(playbook),
    comingSoonDismissed: playbook.comingSoonDismissed || {},
    presetKey: playbook.presetKey || null,
    sortOrder: playbook.sortOrder || 0
  };
}

function skillsLibraryPayload(unlocked, plan, extras = {}) {
  const videos = unlocked
    ? sortSkillVideos((extras.videos || []).map(serializeSubscriptionVideo).filter(Boolean))
    : [];
  const playbooks = unlocked
    ? (extras.playbooks || []).map(serializeSubscriptionPlaybook).filter(Boolean)
    : [];

  return {
    unlocked: Boolean(unlocked),
    plan: plan.id,
    planLabel: plan.label,
    message: unlocked
      ? 'Skills videos and preset playbooks to help you teach faster. New clips and guides will be added here over time.'
      : 'Unlock coach-ready skills videos and preset playbooks with a paid plan. Head coaches can review plans on the Team Management tab.',
    topics: TOPICS,
    playbookCategories: PLAYBOOK_CATEGORIES,
    skillLevels: SKILL_LEVELS,
    lessons: unlocked ? TOPICS : [],
    previewLessons: TOPICS,
    videos,
    playbooks
  };
}

module.exports = {
  TOPICS,
  TOPIC_IDS,
  PLAYBOOK_CATEGORIES,
  PLAYBOOK_CATEGORY_IDS,
  SKILL_LEVELS,
  SKILL_LEVEL_IDS,
  PRESET_PLAYBOOKS,
  LESSONS: TOPICS,
  topicTitle,
  normalizeSkillLevel,
  skillLevelOf,
  skillLevelTitle,
  sortSkillVideos,
  serializeSubscriptionVideo,
  serializeSubscriptionPlaybook,
  skillsLibraryPayload
};
