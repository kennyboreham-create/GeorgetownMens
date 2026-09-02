const { Schema, model } = require('../db/odm');

const WhiteboardItemSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  kind: {
    type: String,
    enum: ['text', 'x', 'o'],
    required: true
  },
  text: {
    type: String,
    trim: true,
    default: ''
  },
  x: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  y: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  url: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

module.exports = model('WhiteboardItem', WhiteboardItemSchema);
