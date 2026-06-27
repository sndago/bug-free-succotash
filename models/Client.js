const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  email:          { type: String, trim: true },
  phone:          { type: String },
  accountNumber:  { type: String, required: true, unique: true },
  accountType:    { type: String, enum: ['savings', 'checking', 'business'], default: 'savings' },
  balance:        { type: Number, default: 0 },
  status:          { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  assignedTeller:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalStatus:  { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  requestedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);
