const { Schema, model } = require('../db/odm');

const PlaybookBlockSchema = new Schema({
  playbookId: {
    type: Schema.Types.ObjectId,
    ref: 'Playbook',
    required: true,
    index: true
  },
  section: {
    type: String,
    enum: [
      'team_rules',
      'backbone_pillars',
      'coaches_admin',
      'systems',
      'base_knowledge',
      'players',
      'links'
    ],
    required: true,
    index: true
  },
  title: { type: String, trim: true, default: '' },
  subtitle: { type: String, trim: true, default: '' },
  body: { type: String, trim: true, default: '' },
  order: { type: Number, default: 0 },
  layoutType: {
    type: String,
    enum: ['vertical_box', 'radial', 'horizontal_hierarchy'],
    default: undefined
  },
  items: [{
    text: { type: String, trim: true, default: '' }
  }],
  name: { type: String, trim: true, default: '' },
  experience: { type: String, trim: true, default: '' },
  jobScope: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  subsection: { type: String, trim: true, default: '' },
  url: { type: String, trim: true, default: '' },
  label: { type: String, trim: true, default: '' },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    default: undefined
  },
  gridFsId: { type: String, default: null },
  r2ObjectKey: { type: String, default: null, trim: true },
  mimeType: { type: String, default: '' },
  originalFilename: { type: String, default: '' }
}, { timestamps: true });

module.exports = model('PlaybookBlock', PlaybookBlockSchema);
