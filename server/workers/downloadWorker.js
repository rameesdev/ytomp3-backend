const { Worker } = require('bullmq');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { redisConfig } = require('../services/queue');
const { getYtDlpPath } = require('../utils/binaries');
const { conversionQueue } = require('../services/queue');

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const worker = new Worker('download', async (job) => {
  const { youtubeId, quality, title, artist, duration, thumbnail, slug } = job.data;
  
  await job.updateProgress(10);
  
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  // Unique file name for the downloaded raw stream
  const rawFileName = `${job.id}-${youtubeId}.raw`;
  const rawPath = path.join(TEMP_DIR, rawFileName);
  
  const ytDlpPath = getYtDlpPath();
  
  // Arguments for yt-dlp to download the best audio format
  const args = [
    '-f', 'bestaudio/best',
    '--no-playlist',
    '-o', rawPath,
    videoUrl
  ];

  console.log(`[Download Worker] Starting download for Job ${job.id} (${title})`);
  
  await job.updateProgress(20);

  return new Promise((resolve, reject) => {
    const process = spawn(ytDlpPath, args);
    let errorOutput = '';

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.stdout.on('data', (data) => {
      // Optional: Parse yt-dlp progress and update job progress
      const output = data.toString();
      const match = output.match(/\[download\]\s+(\d+(\.\d+)?)%/);
      if (match) {
        const percent = parseFloat(match[1]);
        // Scale download percent (0-100%) to job progress (20-90%)
        const jobProgress = Math.round(20 + (percent * 0.7));
        job.updateProgress(jobProgress).catch(() => {});
      }
    });

    process.on('close', async (code) => {
      if (code !== 0) {
        console.error(`[Download Worker] Download failed for Job ${job.id}: ${errorOutput}`);
        // Clean up partial file if it exists
        if (fs.existsSync(rawPath)) {
          fs.unlinkSync(rawPath);
        }
        return reject(new Error(`yt-dlp download failed with exit code ${code}: ${errorOutput}`));
      }

      console.log(`[Download Worker] Download completed for Job ${job.id}. Saved to ${rawPath}`);
      await job.updateProgress(95);

      // Now add conversion job to the conversion queue
      const conversionJob = await conversionQueue.add(`convert-${youtubeId}`, {
        youtubeId,
        quality,
        title,
        artist,
        duration,
        thumbnail,
        slug,
        rawPath,
        downloadJobId: job.id
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      });

      console.log(`[Download Worker] Added conversion job ${conversionJob.id} for Job ${job.id}`);
      await job.updateProgress(100);
      resolve({ rawPath, conversionJobId: conversionJob.id });
    });

    process.on('error', (err) => {
      console.error(`[Download Worker] Process error: ${err.message}`);
      if (fs.existsSync(rawPath)) {
        fs.unlinkSync(rawPath);
      }
      reject(err);
    });
  });
}, {
  connection: redisConfig,
  concurrency: 2 // Allow 2 downloads in parallel
});

worker.on('failed', (job, err) => {
  console.error(`[Download Worker] Job ${job.id} failed: ${err.message}`);
});

console.log('[Download Worker] Started and listening for jobs...');
module.exports = worker;
