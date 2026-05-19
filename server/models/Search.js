const mongoose = require('mongoose');

const SearchSchema = new mongoose.Schema({
  keyword: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  count: { type: Number, default: 1, index: true },
  lastSearched: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Search', SearchSchema);
