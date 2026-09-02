const { Schema, model } = require('../db/odm');

const AssignmentSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['COACH_NOTE', 'VIDEO_COACH', 'VIDEO_PLAYER'],
    required: true
  },
  note: {
    type: String
  },
  videoId: {
    type: Schema.Types.ObjectId,
    ref: 'Video'
  },
  completed: {
    type: Boolean,
    default: false
  },
  uniqueAccessToken: {
    type: String
  },
  hasClickedLink: {
    type: Boolean,
    default: false
  },
  linkClickedAt: {
    type: Date
  },
  watchDurationSeconds: {
    type: Number,
    default: 0
  },
  lastWatchedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = model('Assignment', AssignmentSchema);
