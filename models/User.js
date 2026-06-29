const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone:     { type: String, match: [/^0\d{9}$/, 'Phone must be a 10-digit number starting with 0 (e.g. 0553676107).'] },
  photo:     { type: String },
  referees: [{
    name:         { type: String, trim: true },
    phone:        { type: String },
    email:        { type: String, lowercase: true, trim: true },
    relationship: { type: String, trim: true },
  }],
  role:      { type: String, enum: ['super_admin', 'admin', 'teller'], default: 'teller' },
  staffId:   { type: String, unique: true, sparse: true },
  branch:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  isActive:  { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

userSchema.pre(/^find/, function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

userSchema.pre('countDocuments', function (next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
