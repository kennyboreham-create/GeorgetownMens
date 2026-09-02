const { Schema, model } = require('../db/odm');

const PlayerNoteSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  playerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
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
    trim: true,
    maxlength: 4000
  }
}, { timestamps: true });

module.exports = model('PlayerNote', PlayerNoteSchema);
