const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const apiController = require('../controllers/apiController');
const adminController = require('../controllers/adminController');

// Main Views
router.get('/', mainController.home);
router.get('/trending', mainController.trending);
router.get('/top-downloads', mainController.topDownloads);
router.get('/faq', mainController.faq);
router.get('/blog', mainController.blog);
router.get('/blog/:slug', mainController.blogArticle);

// Admin Routes
router.get('/admin', adminController.dashboard);
router.post('/admin/rebuild-sitemaps', adminController.rebuildSitemaps);

// Static Pages
router.get('/privacy-policy', mainController.staticPage);
router.get('/terms-of-service', mainController.staticPage);
router.get('/dmca', mainController.staticPage);
router.get('/contact', mainController.staticPage);

// Programmatic SEO Pages
router.get('/search/:slug', mainController.searchPage);
router.get('/song/:slug', mainController.songPage);
router.get('/artist/:slug', mainController.artistPage);
router.get('/genre/:slug', mainController.genrePage);

// Download delivery route
router.get('/download/:id', apiController.serveDownload);

module.exports = router;
