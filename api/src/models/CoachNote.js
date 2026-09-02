const { Schema, model } = require('../db/odm');

const CoachNoteSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  completed: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = model('CoachNote', CoachNoteSchema);
