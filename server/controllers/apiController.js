const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const slugify = require('slugify');
const { getVideoInfo, searchVideos, extractYoutubeId } = require('../services/youtube');

// Models
const Song = require('../models/Song');
const Search = require('../models/Search');
const Download = require('../models/Download');
const Artist = require('../models/Artist');

// --- SERVER-SIDE CONCURRENCY QUEUE ---
// Protects AWS Free Tier (1 vCPU) from crashing due to multiple simultaneous ffmpeg transcodes
const MAX_CONCURRENT_DOWNLOADS = 1;
let currentActiveDownloads = 0;
const downloadQueue = [];

function processNextDownload() {
  if (currentActiveDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const nextTask = downloadQueue.shift();
    currentActiveDownloads++;
    nextTask().finally(() => {
      currentActiveDownloads--;
      processNextDownload();
    });
  }
}

function enqueueDownload(task) {
  return new Promise((resolve, reject) => {
    downloadQueue.push(() => task().then(resolve).catch(reject));
    processNextDownload();
  });
}
// -------------------------------------

/**
 * API Search endpoint
 */
exports.search = async (req, res) => {
  try {
    const { q } = req.body;
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // 1. Perform search via lightweight yt-search
    const results = await searchVideos(q, 10);

    // 2. Async track search keyword in DB for programmatic SEO
    const searchSlug = slugify(q, { lower: true, strict: true });
    if (searchSlug) {
      Search.findOneAndUpdate(
        { slug: searchSlug },
        { 
          $set: { keyword: q.trim() },
          $inc: { count: 1 }, 
          $setOnInsert: { lastSearched: new Date() } 
        },
        { upsert: true, new: true }
      ).catch(err => console.error('Error logging search keyword:', err.message));
    }

    return res.json({ results });
  } catch (error) {
    console.error('API search error:', error.message);
    return res.status(500).json({ error: 'Search failed. Please try again.' });
  }
};

/**
 * API Convert endpoint - immediately registers metadata and returns completed download link
 */
exports.convert = async (req, res) => {
  try {
    const { url, quality } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL or Video ID is required' });
    }

    const targetQuality = ['64kbps', '128kbps', '320kbps'].includes(quality) ? quality : '128kbps';
    
    // Extract ID
    const youtubeId = extractYoutubeId(url) || url;
    if (!youtubeId || youtubeId.length !== 11) {
      return res.status(400).json({ error: 'Invalid YouTube URL or Video ID' });
    }

    // 1. Check if metadata is in DB
    let song = await Song.findOne({ youtubeId });
    
    // Check if we have a valid cached rawUrl
    if (song && song.rawUrl && song.rawUrlExpiresAt && new Date() < song.rawUrlExpiresAt) {
      return res.json({
        status: 'completed',
        progress: 100,
        youtubeId,
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        quality: targetQuality,
        downloadUrl: `/download/${song._id}?quality=${targetQuality}`
      });
    }

    let metadata;
    
    if (!song) {
      // Fetch metadata from YouTube
      try {
        metadata = await getVideoInfo(youtubeId);
      } catch (err) {
        return res.status(400).json({ error: 'Failed to fetch video details from YouTube.' });
      }
      
      const { title, artist, duration, thumbnail } = metadata;
      const slug = metadata.slug || slugify(title, { lower: true, strict: true });

      // Save metadata in database so we can log downloads and serve programmatic SEO pages
      song = new Song({
        title,
        slug,
        artist,
        artistSlug: slugify(artist, { lower: true, strict: true }),
        duration,
        thumbnail,
        youtubeId
      });
      await song.save();
    } else {
      metadata = {
        youtubeId: song.youtubeId,
        title: song.title,
        artist: song.artist,
        duration: song.duration,
        thumbnail: song.thumbnail,
        slug: song.slug
      };
    }

    const { title, artist } = metadata;
    const slug = song.slug;

    // Run yt-dlp to get the raw Google Video URL directly
    const { exec } = require('child_process');
    const { getCookiesArgs } = require('../utils/cookies');
    const cookiesArg = getCookiesArgs();

    const videoUrl = `https://www.youtube.com/watch?v=${song.youtubeId}`;
    const ytDlpCmd = process.platform === 'win32' 
      ? `"${require('path').resolve(__dirname, '../../yt-dlp.exe')}"` 
      : `"${require('path').resolve(__dirname, '../../yt-dlp')}"`;
    
    // Request raw URL, --no-warnings ensures we only get the URL in stdout
    const command = `${ytDlpCmd} --no-warnings ${cookiesArg} --js-runtimes node -f "bestaudio[ext=m4a]/bestaudio" --get-url "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp raw url error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch raw stream link from YouTube.' });
      }

      // We split by newline and take the last line to be absolutely sure we skip any hidden warnings
      const lines = stdout.trim().split('\n');
      const rawUrl = lines[lines.length - 1].trim();

      // Cache raw URL in background (expires in 5.5 hours)
      song.rawUrl = rawUrl;
      song.rawUrlExpiresAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      song.save().catch(err => console.error('[Cache] Failed to save rawUrl:', err.message));

      // Return local proxy download URL
      return res.json({
        status: 'completed',
        progress: 100,
        youtubeId,
        slug,
        title,
        artist,
        quality: targetQuality,
        downloadUrl: `/download/${song._id}?quality=${targetQuality}` 
      });
    });

  } catch (error) {
    console.error('API convert error:', error.message);
    return res.status(500).json({ error: 'Server error. Failed to start conversion.' });
  }
};

/**
 * API Status endpoint - legacy fallback
 */
exports.status = async (req, res) => {
  try {
    const { id } = req.params;
    const youtubeId = id.split('-')[0];
    const quality = id.split('-').slice(1).join('-') || '128kbps';
    
    const song = await Song.findOne({ youtubeId });
    if (song) {
      return res.json({
        status: 'completed',
        progress: 100,
        downloadUrl: `/download/${song._id}?quality=${quality}`
      });
    }
    
    return res.status(404).json({ error: 'Job not found.' });
  } catch (error) {
    console.error('API status error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve conversion status.' });
  }
};

/**
 * Serve MP3 file dynamically by proxying direct YouTube stream
 */
exports.serveDownload = async (req, res) => {
  try {
    const { id } = req.params; // Song ObjectId
    const { quality } = req.query; // Quality: 64kbps, 128kbps, 320kbps
    
    const targetQuality = ['64kbps', '128kbps', '320kbps'].includes(quality) ? quality : '128kbps';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid song identifier');
    }

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).send('Song not found in our database');
    }

    // Log the download transaction for analytics
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const downloadTx = new Download({
      songId: song._id,
      quality: targetQuality,
      ipAddress
    });
    await downloadTx.save();

    // Increment downloads count in Song collection
    song.downloadsCount += 1;
    await song.save();

    // Detect if user cancels request while in queue
    let isCancelled = false;
    req.on('close', () => {
      isCancelled = true;
    });

    // Enter the concurrency queue
    await enqueueDownload(() => new Promise((resolve) => {
      if (isCancelled) {
        console.log('User closed tab before their turn. Dropping from queue.');
        return resolve(); // Release lock instantly
      }

      // Ensure lock is released when response is fully sent or connection drops
      let finished = false;
      const releaseLock = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };
      res.on('finish', releaseLock);
      res.on('close', releaseLock);

      // Serve the file as an MP3 audio file by renaming the extension (zero-CPU)
      const safeName = `${song.title} - ${song.artist}`.replace(/[^\x20-\x7E]/g, '').trim() || 'Audio_Download';
      const downloadName = `${safeName}.mp3`.replace(/[\/\\?%*:|"<>]/g, '');

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="YT_Audio.mp3"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);

      const https = require('https');

      // Helper function to stream a URL to the client, following redirects recursively
      const startStreaming = (urlToStream, redirectDepth = 0) => {
        if (redirectDepth > 5) {
          console.error('Too many redirects from YouTube CDN');
          if (!res.headersSent) res.status(500).send('Too many redirects from YouTube CDN.');
          res.end();
          return releaseLock();
        }

        const rangeHeader = req.headers.range || 'bytes=0-';
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': rangeHeader
          }
        };

        https.get(urlToStream, options, (proxyRes) => {
          // If the server returns a redirect (301, 302, 307, 308), follow it recursively
          if ([301, 302, 307, 308].includes(proxyRes.statusCode)) {
            const redirectUrl = proxyRes.headers.location;
            if (redirectUrl) {
              console.log(`[Redirect] Following ${proxyRes.statusCode} to: ${redirectUrl}`);
              return startStreaming(redirectUrl, redirectDepth + 1);
            }
          }

          // If YouTube returns an error, abort
          if (proxyRes.statusCode !== 200 && proxyRes.statusCode !== 206) {
            console.error(`YouTube stream returned status code: ${proxyRes.statusCode}`);
            if (!res.headersSent) res.status(500).send('Failed to stream audio from YouTube.');
            res.end();
            return releaseLock();
          }

          // Forward status code: If client requested a range, send 206. Otherwise, send 200.
          res.statusCode = req.headers.range ? proxyRes.statusCode : 200;

          // Forward Content-Range header only if the client requested a range
          if (req.headers.range && proxyRes.headers['content-range']) {
            res.setHeader('Content-Range', proxyRes.headers['content-range']);
          }
          
          if (proxyRes.headers['content-length']) {
            res.setHeader('Content-Length', proxyRes.headers['content-length']);
          }

          proxyRes.pipe(res);
          
          proxyRes.on('end', () => releaseLock());
          proxyRes.on('error', (err) => {
            console.error('Proxy stream error:', err);
            res.end();
            releaseLock();
          });
        }).on('error', (err) => {
          console.error('HTTPS get error:', err);
          if (!res.headersSent) res.status(500).send('Failed to connect to YouTube stream.');
          res.end();
          releaseLock();
        });
      };

      // Check if we have a valid, cached rawUrl
      if (song.rawUrl && song.rawUrlExpiresAt && new Date() < song.rawUrlExpiresAt) {
        console.log(`[Cache Hit] Streaming rawUrl directly for: ${song.title}`);
        return startStreaming(song.rawUrl);
      }

      // Cache miss - run yt-dlp to get a fresh raw URL
      console.log(`[Cache Miss] Running yt-dlp to get fresh rawUrl for: ${song.title}`);
      const { exec } = require('child_process');
      const { getCookiesArgs } = require('../utils/cookies');
      const cookiesArg = getCookiesArgs();

      const videoUrl = `https://www.youtube.com/watch?v=${song.youtubeId}`;
      const ytDlpCmd = process.platform === 'win32' 
        ? `"${require('path').resolve(__dirname, '../../yt-dlp.exe')}"` 
        : `"${require('path').resolve(__dirname, '../../yt-dlp')}"`;
      
      const command = `${ytDlpCmd} --no-warnings ${cookiesArg} --js-runtimes node -f "bestaudio[ext=m4a]/bestaudio" --get-url "${videoUrl}"`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('yt-dlp error:', error.message);
          if (!res.headersSent) res.status(500).send('Failed to fetch audio stream URL.');
          res.end();
          return releaseLock();
        }

        const lines = stdout.trim().split('\n');
        const freshUrl = lines[lines.length - 1].trim();

        // Update database cache
        song.rawUrl = freshUrl;
        song.rawUrlExpiresAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        song.save().catch(err => console.error('[Cache] Failed to update rawUrl:', err.message));

        startStreaming(freshUrl);
      });
    }));

  } catch (error) {
    console.error('Serve download error:', error.message);
    return res.status(500).send('An error occurred while serving the download.');
  }
};
