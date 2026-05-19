require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

// Services & Middleware
const seoMiddleware = require('./middleware/seo');
const internalLinksMiddleware = require('./middleware/internalLinks');
const { generateSitemaps } = require('./services/sitemap');

// Routes
const mainRoutes = require('./routes/mainRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Establish Database Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ytomp3';
mongoose.connect(mongoUri)
  .then(() => {
    console.log('[Server] Successfully connected to MongoDB.');
    // Trigger initial sitemap build on launch
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    generateSitemaps(appUrl);
  })
  .catch(err => {
    console.error('[Server] MongoDB connection error:', err);
    process.exit(1);
  });

// 2. Security & Performance Middlewares
app.use(compression()); // Gzip compression for faster delivery
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://img.youtube.com", "https://*.ytimg.com"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"]
      }
    }
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// 3. Static Assets Folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// 4. Rate Limiting to prevent scraping and abuse
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per window
  message: 'Too many requests from this IP. Please try again later.'
});

const convertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 downloads/conversions per window
  message: { error: 'Too many conversion attempts. Please try again in 15 minutes.' }
});

app.use('/api/', globalLimiter);
app.use('/api/convert', convertLimiter);

// 5. Template Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 6. Global Programmatic SEO & Internal Linking Engine Mount
app.use(seoMiddleware);
app.use(internalLinksMiddleware);

// 7. Routes Mount
app.use('/', mainRoutes);
app.use('/api', apiRoutes);

// 8. Background Cron Jobs (Sitemap rebuilds every 12 hours)
cron.schedule('0 */12 * * *', () => {
  console.log('[Cron Job] Rebuilding sitemaps dynamically...');
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  generateSitemaps(appUrl).catch(e => console.error('[Cron Job] Sitemap rebuild failed:', e.message));
});

// 9. Error Handling
app.use((req, res, next) => {
  res.status(404);
  res.locals.seo = {
    title: '404 Page Not Found – YTMP3',
    description: 'The requested page was not found.',
    robots: 'noindex, nofollow',
    breadcrumbs: []
  };
  res.render('static/contact'); // fallback to contact or custom 404 page
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err.stack);
  res.status(500).send('Internal Server Error');
});

// 10. Start Server
app.listen(PORT, () => {
  console.log(`[Server] Core HTTP server listening on port ${PORT}`);
});
