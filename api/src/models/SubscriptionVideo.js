const { Schema, model } = require('../db/odm');
const { TOPIC_IDS } = require('../utils/skillsLibrary');

const SubscriptionVideoSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  topic: {
    type: String,
    required: true,
    enum: TOPIC_IDS
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  level: {
    type: Number,
    min: 1,
    max: 10,
    default: 1
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

SubscriptionVideoSchema.index({ topic: 1, level: 1, sortOrder: 1, createdAt: 1 });

module.exports = model('SubscriptionVideo', SubscriptionVideoSchema);
