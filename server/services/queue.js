const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null // Required by BullMQ
};

if (process.env.REDIS_TLS === 'true') {
  redisConfig.tls = {};
}

// Create a reusable Redis connection for BullMQ client
const connection = new Redis(redisConfig);

const downloadQueue = new Queue('download', { connection });
const conversionQueue = new Queue('conversion', { connection });
const cleanupQueue = new Queue('cleanup', { connection });

module.exports = {
  downloadQueue,
  conversionQueue,
  cleanupQueue,
  redisConnection: connection,
  redisConfig
};
