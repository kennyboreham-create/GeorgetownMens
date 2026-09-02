const { Schema, model } = require('../db/odm');
const { PLAYBOOK_CATEGORY_IDS } = require('../utils/skillsLibrary');
const { SECTIONS, sectionBoolDefaults } = require('../utils/playbookBlocks');

const SubscriptionPlaybookSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: PLAYBOOK_CATEGORY_IDS
  },
  summary: {
    type: String,
    default: '',
    trim: true
  },
  outline: {
    type: [String],
    default: () => []
  },
  sectionOrder: {
    type: [String],
    default: () => [...SECTIONS]
  },
  hiddenSections: sectionBoolDefaults(),
  comingSoonDismissed: sectionBoolDefaults(),
  presetKey: {
    type: String,
    default: null,
    trim: true,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

SubscriptionPlaybookSchema.index({ category: 1, sortOrder: 1, createdAt: 1 });

module.exports = model('SubscriptionPlaybook', SubscriptionPlaybookSchema);
