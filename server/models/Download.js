const mongoose = require('mongoose');

const DownloadSchema = new mongoose.Schema({
  songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true, index: true },
  quality: { type: String, enum: ['64kbps', '128kbps', '320kbps'], required: true },
  ipAddress: { type: String },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Download', DownloadSchema);
