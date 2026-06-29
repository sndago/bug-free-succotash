const mongoose = require('mongoose');
require('./Branch');

const clientSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  email:          { type: String, trim: true },
  phone:          { type: String, required: true, match: [/^0\d{9}$/, 'Phone must be a 10-digit number starting with 0 (e.g. 0553676107).'] },
  accountNumber:  { type: String, required: true, unique: true },
  accountType:    { type: String, enum: ['savings', 'checking', 'business'], default: 'savings' },
  balance:        { type: Number, default: 0 },
  status:          { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  assignedTeller:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  homeBranch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  approvalStatus:  { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  requestedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  photo:           { type: String },
  isDeleted:       { type: Boolean, default: false, index: true },
  deletedAt:       { type: Date },
  deletedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

clientSchema.pre(/^find/, function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

clientSchema.pre('countDocuments', function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

module.exports = mongoose.model('Client', clientSchema);
