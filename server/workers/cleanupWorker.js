const { Worker } = require('bullmq');
const path = require('path');
const fs = require('fs');
const { redisConfig } = require('../services/queue');

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const worker = new Worker('cleanup', async (job) => {
  console.log(`[Cleanup Worker] Starting disk cleanup Job ${job.id}`);
  
  const now = Date.now();
  // 2 hours threshold for temp raw files
  const TEMP_MAX_AGE = 2 * 60 * 60 * 1000; 
  // 24 hours threshold for converted MP3 files
  const UPLOADS_MAX_AGE = 24 * 60 * 60 * 1000; 

  let tempCount = 0;
  let uploadCount = 0;

  // 1. Clean TEMP_DIR
  if (fs.existsSync(TEMP_DIR)) {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        if (age > TEMP_MAX_AGE) {
          fs.unlinkSync(filePath);
          tempCount++;
        }
      } catch (err) {
        console.error(`[Cleanup Worker] Failed to clean temp file ${file}:`, err.message);
      }
    }
  }

  // 2. Clean UPLOADS_DIR
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      try {
        // Skip hidden files
        if (file.startsWith('.')) continue;
        
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        if (age > UPLOADS_MAX_AGE) {
          fs.unlinkSync(filePath);
          uploadCount++;
        }
      } catch (err) {
        console.error(`[Cleanup Worker] Failed to clean upload file ${file}:`, err.message);
      }
    }
  }

  console.log(`[Cleanup Worker] Finished. Cleaned ${tempCount} raw temp files and ${uploadCount} converted MP3 files.`);
  return { deletedTempFiles: tempCount, deletedUploadFiles: uploadCount };
}, {
  connection: redisConfig
});

worker.on('failed', (job, err) => {
  console.error(`[Cleanup Worker] Cleanup Job ${job.id} failed: ${err.message}`);
});

console.log('[Cleanup Worker] Started and listening for jobs...');
module.exports = worker;
