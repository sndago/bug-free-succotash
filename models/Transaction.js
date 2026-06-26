const mongoose = require('mongoose');

const txnSchema = new mongoose.Schema({
  client:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  type:         { type: String, enum: ['credit', 'debit'], required: true },
  amount:       { type: Number, required: true, min: 0 },
  description:  { type: String, required: true, trim: true },
  category:     { type: String, enum: ['deposit', 'withdrawal', 'transfer', 'payment', 'fee', 'interest'], default: 'deposit' },
  reference:    { type: String },
  balanceAfter: { type: Number, required: true },
  status:       { type: String, enum: ['completed', 'pending', 'failed'], default: 'completed' },
  date:         { type: Date, default: Date.now },
}, { timestamps: true });

txnSchema.index({ client: 1, date: -1 });

txnSchema.pre('save', function (next) {
  if (!this.reference) {
    const ds   = new Date(this.date).toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.reference = `TXN-${ds}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', txnSchema);
