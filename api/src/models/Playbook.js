const { Schema, model } = require('../db/odm');

const SECTIONS = [
  'team_rules',
  'backbone_pillars',
  'coaches_admin',
  'systems',
  'base_knowledge',
  'players',
  'links'
];

const sectionBoolDefaults = () => ({
  team_rules: { type: Boolean, default: false },
  backbone_pillars: { type: Boolean, default: false },
  coaches_admin: { type: Boolean, default: false },
  systems: { type: Boolean, default: false },
  base_knowledge: { type: Boolean, default: false },
  players: { type: Boolean, default: false },
  links: { type: Boolean, default: false }
});

const PlaybookSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
    unique: true,
    index: true
  },
  teamName: {
    type: String,
    required: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  shareToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sectionOrder: {
    type: [String],
    default: () => [...SECTIONS]
  },
  hiddenSections: sectionBoolDefaults(),
  comingSoonDismissed: sectionBoolDefaults()
}, { timestamps: true });

const Playbook = model('Playbook', PlaybookSchema);
Playbook.SECTIONS = SECTIONS;
module.exports = Playbook;
module.exports.SECTIONS = SECTIONS;
