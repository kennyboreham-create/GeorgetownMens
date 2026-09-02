const { Schema, model } = require('../db/odm');

const GoalSchema = new Schema({
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
  description: {
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
  originated: {
    type: String,
    enum: ['Coach', 'Player'],
    default: 'Coach',
    required: true
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  completed: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  targetDate: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = model('Goal', GoalSchema);
