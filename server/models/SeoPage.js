const mongoose = require('mongoose');

const SeoPageSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  keywords: { type: String },
  content: { type: String },
  type: { type: String, default: 'custom', index: true }, // e.g. custom, blog, static
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SeoPage', SeoPageSchema);
