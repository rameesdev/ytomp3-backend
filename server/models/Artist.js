const mongoose = require('mongoose');

const ArtistSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  image: { type: String },
  genres: [{ type: String, index: true }],
  bio: { type: String },
  views: { type: Number, default: 0, index: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Artist', ArtistSchema);
