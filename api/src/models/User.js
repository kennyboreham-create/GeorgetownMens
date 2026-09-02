const { Schema, model } = require('../db/odm');

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['HEAD_COACH', 'COACH', 'PLAYER', 'ADMIN'],
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'Team'
  },
  jerseyNumber: {
    type: Number
  },
  assignedCoachId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isPlatformAdmin: {
    type: Boolean,
    default: false
  },
  adminPassword: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  }
}, { timestamps: true });

module.exports = model('User', UserSchema);
