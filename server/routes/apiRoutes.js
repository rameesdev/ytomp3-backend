const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

router.post('/search', apiController.search);
router.post('/convert', apiController.convert);
router.get('/status/:id', apiController.status);

module.exports = router;
