const express = require('express');
const router = express.Router();
const { accessPlayerVideo, streamPlayerVideo, reportWatchProgress } = require('../controllers/playerController');

router.get('/access-video/:token/stream', streamPlayerVideo);
router.patch('/access-video/:token/watch', reportWatchProgress);
router.get('/access-video/:token', accessPlayerVideo);

module.exports = router;