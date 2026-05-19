const Song = require('../models/Song');
const Artist = require('../models/Artist');
const Search = require('../models/Search');

let cache = {
  recentSongs: [],
  popularArtists: [],
  trendingSearches: [],
  genres: [
    { name: 'Pop', slug: 'pop' },
    { name: 'EDM', slug: 'edm' },
    { name: 'Rock', slug: 'rock' },
    { name: 'Hip Hop', slug: 'hip-hop' },
    { name: 'R&B', slug: 'r-and-b' },
    { name: 'Latin', slug: 'latin' },
    { name: 'Country', slug: 'country' },
    { name: 'Jazz', slug: 'jazz' }
  ],
  lastUpdated: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function updateLinksCache() {
  try {
    // 1. Fetch recent songs
    const recentSongs = await Song.find({}, 'title slug artist thumbnail')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 2. Fetch popular artists
    const popularArtists = await Artist.find({}, 'name slug image')
      .sort({ views: -1 })
      .limit(10)
      .lean();

    // 3. Fetch trending search keywords
    const trendingSearches = await Search.find({}, 'keyword slug count')
      .sort({ count: -1, lastSearched: -1 })
      .limit(12)
      .lean();

    cache.recentSongs = recentSongs;
    cache.popularArtists = popularArtists;
    cache.trendingSearches = trendingSearches;
    cache.lastUpdated = Date.now();
  } catch (error) {
    console.error('[Internal Links Engine] Cache update failed:', error.message);
  }
}

module.exports = async (req, res, next) => {
  // Update cache if expired
  if (Date.now() - cache.lastUpdated > CACHE_DURATION) {
    await updateLinksCache();
  }

  // Attach link data to res.locals
  res.locals.internalLinks = {
    recentSongs: cache.recentSongs,
    popularArtists: cache.popularArtists,
    trendingSearches: cache.trendingSearches,
    genres: cache.genres
  };

  next();
};
