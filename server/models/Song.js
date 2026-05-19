const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  artist: { type: String, required: true, trim: true, default: 'Unknown Artist' },
  artistSlug: { type: String, index: true },
  duration: { type: Number, default: 0 }, // in seconds
  thumbnail: { type: String },
  youtubeId: { type: String, required: true, unique: true, index: true },
  rawUrl: { type: String },
  rawUrlExpiresAt: { type: Date },
  tags: [{ type: String }],
  views: { type: Number, default: 0, index: true },
  downloadsCount: { type: Number, default: 0, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Auto-populate artistSlug if empty
SongSchema.pre('save', function (next) {
  if (this.artist && !this.artistSlug) {
    const slugify = require('slugify');
    this.artistSlug = slugify(this.artist, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model('Song', SongSchema);
