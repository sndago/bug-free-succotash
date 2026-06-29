const mongoose = require('mongoose');

const txnSchema = new mongoose.Schema({
  client:           { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  account:          { type: mongoose.Schema.Types.ObjectId, ref: 'Account', index: true },
  type:             { type: String, enum: ['credit', 'debit'], required: true },
  amount:           { type: Number, required: true, min: 0 },
  description:      { type: String, required: true, trim: true },
  category:         { type: String, enum: ['deposit', 'withdrawal', 'transfer', 'payment', 'fee', 'interest', 'loan'], default: 'deposit' },
  reference:        { type: String },
  balanceAfter:     { type: Number },
  status:           { type: String, enum: ['completed', 'pending', 'failed'], default: 'completed' },
  date:             { type: Date, default: Date.now },

  // Approval workflow (new transactions)
  requiresApproval: { type: Boolean, default: false },
  approvalStatus:   { type: String, enum: ['na', 'pending', 'approved', 'rejected'], default: 'na' },
  requestedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:       { type: Date },
  rejectionReason:  { type: String, trim: true },

  // Edit request workflow (old transactions)
  pendingEdit: {
    requestedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt:     { type: Date },
    type:            { type: String, enum: ['credit', 'debit'] },
    amount:          { type: Number, min: 0 },
    description:     { type: String, trim: true },
    category:        { type: String, enum: ['deposit', 'withdrawal', 'transfer', 'payment', 'fee', 'interest', 'loan'] },
    reference:       { type: String },
    editStatus:      { type: String, enum: ['pending', 'approved', 'rejected'] },
    approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:      { type: Date },
    rejectionReason: { type: String, trim: true },
  },

  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

txnSchema.index({ client: 1, date: -1 });
txnSchema.index({ approvalStatus: 1, requiresApproval: 1 });
txnSchema.index({ 'pendingEdit.editStatus': 1 });

txnSchema.pre(/^find/, function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

txnSchema.pre('countDocuments', function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

txnSchema.pre('save', function (next) {
  if (!this.reference) {
    const ds   = new Date(this.date).toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.reference = `TXN-${ds}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', txnSchema);
