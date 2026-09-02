const { Schema, model } = require('../db/odm');

const CoachGoalDrillSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  completed: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const CoachGoalStepSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  drills: {
    type: [CoachGoalDrillSchema],
    default: []
  }
}, { _id: true });

const CoachGoalSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['Skills', 'Behaviour', 'Strategy'],
    default: 'Skills',
    required: true
  },
  steps: {
    type: [CoachGoalStepSchema],
    default: []
  }
}, { timestamps: true });

CoachGoalSchema.index({ teamId: 1, createdBy: 1, createdAt: -1 });

module.exports = model('CoachGoal', CoachGoalSchema);
