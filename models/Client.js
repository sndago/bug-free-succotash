const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  email:          { type: String, trim: true },
  phone:          { type: String },
  accountNumber:  { type: String, required: true, unique: true },
  accountType:    { type: String, enum: ['savings', 'checking', 'business'], default: 'savings' },
  balance:        { type: Number, default: 0 },
  status:         { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  assignedTeller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);
