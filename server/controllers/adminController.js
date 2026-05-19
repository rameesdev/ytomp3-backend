const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { downloadQueue, conversionQueue } = require('../services/queue');
const { generateSitemaps } = require('../services/sitemap');

// Models
const Song = require('../models/Song');
const Artist = require('../models/Artist');
const Search = require('../models/Search');
const Download = require('../models/Download');
const SeoPage = require('../models/SeoPage');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const SITEMAPS_DIR = path.join(PUBLIC_DIR, 'sitemaps');

/**
 * Render Admin Dashboard
 */
exports.dashboard = async (req, res) => {
  try {
    // 1. Database Counts (SEO Page Counts)
    const songCount = await Song.countDocuments();
    const artistCount = await Artist.countDocuments();
    const searchCount = await Search.countDocuments();
    const customSeoCount = await SeoPage.countDocuments();
    const totalDownloads = await Download.countDocuments();
    
    // Total programmatic pages = Home + Static + (Songs * 1) + (Artists * 1) + (Searches * 1) + Custom
    const totalProgrammaticPages = 10 + songCount * 2 + artistCount * 2 + searchCount;

    // 2. Trending Keywords & Searches
    const trendingKeywords = await Search.find().sort({ count: -1 }).limit(10).lean();

    // 3. Top Downloaded / Viewed Songs
    const topSongs = await Song.find().sort({ downloadsCount: -1, views: -1 }).limit(10).lean();

    // 4. Recent Downloads (Analytics)
    const recentDownloads = await Download.find()
      .populate('songId', 'title artist slug')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 5. Queue Telemetry from BullMQ
    let downloadQueueCounts = { wait: 0, active: 0, completed: 0, failed: 0 };
    let conversionQueueCounts = { wait: 0, active: 0, completed: 0, failed: 0 };
    let failedJobs = [];

    try {
      downloadQueueCounts = await downloadQueue.getJobCounts('wait', 'active', 'completed', 'failed');
      conversionQueueCounts = await conversionQueue.getJobCounts('wait', 'active', 'completed', 'failed');

      // Fetch last 5 failed download jobs
      const failedDls = await downloadQueue.getJobs(['failed'], 0, 5, false);
      for (const job of failedDls) {
        failedJobs.push({
          id: job.id,
          queue: 'Download',
          title: job.data.title || 'Unknown',
          error: job.failedReason || 'Unknown Error',
          time: job.finishedOn ? new Date(job.finishedOn).toLocaleTimeString() : 'N/A'
        });
      }

      // Fetch last 5 failed conversion jobs
      const failedCvs = await conversionQueue.getJobs(['failed'], 0, 5, false);
      for (const job of failedCvs) {
        failedJobs.push({
          id: job.id,
          queue: 'Conversion',
          title: job.data.title || 'Unknown',
          error: job.failedReason || 'Unknown Error',
          time: job.finishedOn ? new Date(job.finishedOn).toLocaleTimeString() : 'N/A'
        });
      }
    } catch (queueError) {
      console.error('[Admin Dashboard] Queue fetch error:', queueError.message);
    }

    // 6. Sitemap Status
    const sitemaps = [
      { name: 'sitemap.xml', path: path.join(PUBLIC_DIR, 'sitemap.xml') },
      { name: 'sitemap-main.xml', path: path.join(SITEMAPS_DIR, 'sitemap-main.xml') },
      { name: 'sitemap-songs.xml', path: path.join(SITEMAPS_DIR, 'sitemap-songs.xml') },
      { name: 'sitemap-artists.xml', path: path.join(SITEMAPS_DIR, 'sitemap-artists.xml') },
      { name: 'sitemap-searches.xml', path: path.join(SITEMAPS_DIR, 'sitemap-searches.xml') }
    ];

    const sitemapStatus = sitemaps.map(sm => {
      const exists = fs.existsSync(sm.path);
      let size = 'N/A';
      let mtime = 'N/A';

      if (exists) {
        const stats = fs.statSync(sm.path);
        size = (stats.size / 1024).toFixed(2) + ' KB';
        mtime = stats.mtime.toLocaleString();
      }

      return {
        name: sm.name,
        exists,
        size,
        lastModified: mtime
      };
    });

    // Set SEO variables to override default homepage headers for admin dashboard
    res.locals.seo = {
      title: 'Admin Analytics Dashboard – YTMP3 Engine',
      description: 'System telemetry, queue monitoring, and SEO status for the YTMP3 programmatic platform.',
      robots: 'noindex, nofollow', // Prevent search engines from crawling the dashboard
      breadcrumbs: []
    };

    return res.render('admin/dashboard', {
      songCount,
      artistCount,
      searchCount,
      customSeoCount,
      totalDownloads,
      totalProgrammaticPages,
      trendingKeywords,
      topSongs,
      recentDownloads,
      downloadQueueCounts,
      conversionQueueCounts,
      failedJobs,
      sitemapStatus
    });
  } catch (error) {
    console.error('Admin rendering error:', error.message);
    return res.status(500).send('Admin dashboard rendering failed: ' + error.message);
  }
};

/**
 * API Trigger Rebuild Sitemap
 */
exports.rebuildSitemaps = async (req, res) => {
  try {
    const domain = `${req.protocol}://${req.get('host')}`;
    await generateSitemaps(domain);
    return res.json({ success: true, message: 'Sitemaps rebuilt successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
