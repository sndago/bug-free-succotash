const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, unique: true },
  code:     { type: String, trim: true, uppercase: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Branch', branchSchema);
