const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:    { type: String },
  userRole:    { type: String },
  action:      { type: String, required: true },
  entity:      { type: String }, // 'auth' | 'client' | 'transaction' | 'user'
  entityId:    { type: mongoose.Schema.Types.ObjectId },
  description: { type: String, required: true },
  meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  ip:          { type: String },
}, { timestamps: true });

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
