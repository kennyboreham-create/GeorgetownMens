const { Schema, model } = require('../db/odm');

const VideoSchema = new Schema({
  /** Required for team videos; omit or null when isGlobal is true. */
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    default: null,
    required: function requiredTeamId() {
      return !this.isGlobal;
    }
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true
  },
  /** Unused leftover field from the old GridFS store. Playback uses r2ObjectKey. */
  gridFsId: {
    type: String,
    default: null
  },
  /** Object key in the Cloudflare R2 bucket for original uploaded files. */
  r2ObjectKey: {
    type: String,
    default: null,
    trim: true
  },
  localFilePath: {
    type: String,
    default: null,
    trim: true
  },
  originalFilename: {
    type: String,
    trim: true
  },
  mimeType: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isGlobal: {
    type: Boolean,
    default: false
  },
  isSnippet: {
    type: Boolean,
    default: false
  },
  parentVideoId: {
    type: Schema.Types.ObjectId,
    ref: 'Video'
  },
  startTime: {
    type: Number
  },
  endTime: {
    type: Number
  },
  clipStartSeconds: {
    type: Number,
    min: 0
  },
  clipEndSeconds: {
    type: Number,
    min: 0
  },
  muteAudio: {
    type: Boolean,
    default: false
  },
  overlays: [{
    type: { type: String, enum: ['arrow', 'speaker'] },
    xPercent: { type: Number, default: 50 },
    yPercent: { type: Number, default: 50 },
    offsetSeconds: { type: Number, default: 0 },
    durationMs: { type: Number, default: 5000 },
    text: { type: String, default: '' }
  }]
}, { timestamps: true });

module.exports = model('Video', VideoSchema);
