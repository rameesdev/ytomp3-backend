const { Worker } = require('bullmq');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const slugify = require('slugify');
const mongoose = require('mongoose');

const { redisConfig } = require('../services/queue');
const { getFfmpegPath, getFfprobePath } = require('../utils/binaries');
const { generateSongSeo, generateSongFaq } = require('../utils/seoGenerator');

// Models
const Song = require('../models/Song');
const Artist = require('../models/Artist');
const SeoPage = require('../models/SeoPage');

// Setup ffmpeg paths
ffmpeg.setFfmpegPath(getFfmpegPath());
ffmpeg.setFfprobePath(getFfprobePath());

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const worker = new Worker('conversion', async (job) => {
  const { youtubeId, quality, title, artist, duration, thumbnail, slug, rawPath } = job.data;
  
  await job.updateProgress(10);
  
  // Output path config
  // e.g. uploads/on-my-way-320kbps.mp3
  const outputFileName = `${slug}-${quality}.mp3`;
  const outputPath = path.join(UPLOADS_DIR, outputFileName);
  
  console.log(`[Conversion Worker] Starting transcoding for Job ${job.id} (${title} -> ${quality})`);
  
  // Parse bitrate: e.g. '320kbps' -> 320 or default 128
  const bitrate = parseInt(quality.replace('kbps', '')) || 128;
  
  await job.updateProgress(20);

  // Check if target file already exists
  if (fs.existsSync(outputPath)) {
    console.log(`[Conversion Worker] File already exists at ${outputPath}. Skipping transcoding.`);
    await job.updateProgress(80);
    await updateDatabase(youtubeId, title, artist, duration, thumbnail, slug, quality, outputFileName);
    await job.updateProgress(100);
    
    // Clean up temporary download raw file
    if (fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath);
    }
    return { outputPath, reused: true };
  }

  if (!fs.existsSync(rawPath)) {
    throw new Error(`Raw download file not found at ${rawPath}`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(rawPath)
      .toFormat('mp3')
      .audioBitrate(bitrate)
      .on('start', (commandLine) => {
        console.log(`[Conversion Worker] FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        // progress.percent can be undefined, let's map it safely
        if (progress.percent) {
          const jobProgress = Math.round(20 + (progress.percent * 0.6));
          job.updateProgress(jobProgress).catch(() => {});
        }
      })
      .on('end', async () => {
        console.log(`[Conversion Worker] Transcoding completed for Job ${job.id}. Saved to ${outputPath}`);
        await job.updateProgress(90);
        
        try {
          await updateDatabase(youtubeId, title, artist, duration, thumbnail, slug, quality, outputFileName);
          await job.updateProgress(100);
          
          // Clean up raw download temp file
          if (fs.existsSync(rawPath)) {
            fs.unlinkSync(rawPath);
          }
          
          resolve({ outputPath, reused: false });
        } catch (dbErr) {
          console.error(`[Conversion Worker] DB Update failed: ${dbErr.message}`);
          reject(dbErr);
        }
      })
      .on('error', (err) => {
        console.error(`[Conversion Worker] Transcoding failed: ${err.message}`);
        // Clean up corrupted output if created
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      })
      .save(outputPath);
  });
}, {
  connection: redisConfig,
  concurrency: 4 // Allow 4 transcodes in parallel (CPU intensive)
});

/**
 * Update MongoDB collections and generate programmatic SEO content
 */
async function updateDatabase(youtubeId, title, artist, duration, thumbnail, slug, quality, outputFileName) {
  // 1. Create or update the Song
  const artistSlug = slugify(artist, { lower: true, strict: true });
  
  let song = await Song.findOne({ youtubeId });
  if (!song) {
    song = new Song({
      title,
      slug,
      artist,
      artistSlug,
      duration,
      thumbnail,
      youtubeId,
      views: 1
    });
  } else {
    song.views += 1;
  }
  
  await song.save();
  
  // 2. Create or update the Artist details
  let artistDoc = await Artist.findOne({ slug: artistSlug });
  if (!artistDoc) {
    artistDoc = new Artist({
      name: artist,
      slug: artistSlug,
      image: thumbnail, // Fallback image is song thumbnail
      genres: ['Pop', 'Music'] // Default placeholder genres
    });
    await artistDoc.save();
  } else {
    artistDoc.views += 1;
    await artistDoc.save();
  }

  // 3. Create or update the Programmatic SEO page for the song
  const seoSlug = `song/${slug}`;
  let seoPage = await SeoPage.findOne({ slug: seoSlug });
  if (!seoPage) {
    const seoTitle = `${title} MP3 Download – YTMP3 YouTube Converter`;
    const seoDescription = `Convert and download ${title} MP3 from YouTube using YTMP3. Fast and free YouTube to MP3 conversion.`;
    const seoContent = generateSongSeo(title, artist);
    
    seoPage = new SeoPage({
      slug: seoSlug,
      title: seoTitle,
      description: seoDescription,
      keywords: `${slug}, ${title} mp3, download ${title}, youtube to mp3 ${title}, ytomp3`,
      content: seoContent,
      type: 'song'
    });
    await seoPage.save();
  }

  // 4. Create or update the Programmatic SEO page for the artist
  const artistSeoSlug = `artist/${artistSlug}`;
  let artistSeoPage = await SeoPage.findOne({ slug: artistSeoSlug });
  if (!artistSeoPage) {
    const artistSeoTitle = `Download ${artist} MP3 Songs Free – YTMP3`;
    const artistSeoDescription = `Convert and download top hits from ${artist} in high quality MP3 format. Free YouTube to MP3 converter for ${artist} songs.`;
    const artistSeoContent = require('../utils/seoGenerator').generateArtistSeo(artist);
    
    artistSeoPage = new SeoPage({
      slug: artistSeoSlug,
      title: artistSeoTitle,
      description: artistSeoDescription,
      keywords: `${artistSlug}, ${artist} songs, download ${artist} mp3, convert ${artist} youtube`,
      content: artistSeoContent,
      type: 'artist'
    });
    await artistSeoPage.save();
  }
}

worker.on('failed', (job, err) => {
  console.error(`[Conversion Worker] Job ${job.id} failed: ${err.message}`);
  // Clean up rawPath if job failed in between
  if (job && job.data && job.data.rawPath && fs.existsSync(job.data.rawPath)) {
    try {
      fs.unlinkSync(job.data.rawPath);
    } catch (e) {}
  }
});

console.log('[Conversion Worker] Started and listening for jobs...');
module.exports = worker;
