const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  client:          { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  accountNumber:   { type: String, required: true, unique: true },
  accountType:     { type: String, enum: ['savings', 'checking', 'business', 'loan'], default: 'savings' },
  balance:         { type: Number, default: 0 },
  status:          { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  approvalStatus:  { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  requestedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  isDeleted:       { type: Boolean, default: false, index: true },
  deletedAt:       { type: Date },
  deletedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

accountSchema.index({ client: 1, createdAt: 1 });

accountSchema.pre(/^find/, function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

accountSchema.pre('countDocuments', function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

module.exports = mongoose.model('Account', accountSchema);
