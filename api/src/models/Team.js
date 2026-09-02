const { Schema, model } = require('../db/odm');

const TeamSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  headCoachId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shiftCounter: {
    type: Number,
    default: 1
  },
  subscriptionPlan: {
    type: String,
    enum: ['free', 'plus', 'pro', 'premium'],
    default: 'free'
  },
  subscriptionInterval: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  subscriptionStatus: {
    type: String,
    enum: ['inactive', 'pending', 'active', 'canceled'],
    default: 'inactive'
  },
  subscriptionRequestedPlan: {
    type: String,
    enum: ['plus', 'pro', 'premium'],
    default: undefined
  },
  subscriptionRequestedInterval: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: undefined
  },
  squareCustomerId: { type: String, default: null },
  squareSubscriptionId: { type: String, default: null },
  paypalPayerId: { type: String, default: null },
  paypalSubscriptionId: { type: String, default: null },
  subscriptionUpdatedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = model('Team', TeamSchema);
