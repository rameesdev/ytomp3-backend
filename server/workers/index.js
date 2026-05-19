require('dotenv').config();
const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ytomp3';
mongoose.connect(mongoUri)
  .then(() => console.log('[Worker Process] Connected to MongoDB.'))
  .catch(err => {
    console.error('[Worker Process] MongoDB connection error:', err);
    process.exit(1);
  });

// Load Workers
const downloadWorker = require('./downloadWorker');
const conversionWorker = require('./conversionWorker');
const cleanupWorker = require('./cleanupWorker');

// Initialize the repeatable cleanup job
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
};

if (process.env.REDIS_TLS === 'true') {
  redisConfig.tls = {};
}

const connection = new Redis(redisConfig);
const cleanupQueue = new Queue('cleanup', { connection });

async function scheduleCleanup() {
  // Clear any existing repeatable jobs to avoid duplicates
  const repeatableJobs = await cleanupQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await cleanupQueue.removeRepeatableByKey(job.key);
  }

  // Add the cleanup job to run every hour
  await cleanupQueue.add('scheduled-cleanup', {}, {
    repeat: {
      pattern: '0 * * * *' // Cron pattern: every hour
    }
  });
  console.log('[Worker Process] Scheduled repeatable cleanup job (Every Hour).');
}

scheduleCleanup().catch(err => {
  console.error('[Worker Process] Error scheduling cleanup job:', err.message);
});

// Graceful shutdown handling
const shutdown = async () => {
  console.log('\n[Worker Process] Shutting down workers...');
  try {
    await downloadWorker.close();
    await conversionWorker.close();
    await cleanupWorker.close();
    await mongoose.connection.close();
    await connection.quit();
    console.log('[Worker Process] Workers shut down successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[Worker Process] Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
