const express = require('express');
const router = express.Router();
const {
  uploadVideo,
  uploadVideoFile,
  initDirectUpload,
  completeDirectUpload,
  insertYouTubeVideo,
  streamVideo,
  downloadVideo,
  saveSnippet,
  getVideos,
  getVideoTags,
  addTags,
  deleteVideo,
} = require('../controllers/videoController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { streamAuth } = require('../middleware/streamAuthMiddleware');
const { uploadVideoFile: uploadMiddleware } = require('../middleware/uploadMiddleware');

router.get('/:id/stream', streamAuth, authorize('HEAD_COACH', 'COACH'), streamVideo);
router.get('/:id/download', streamAuth, authorize('HEAD_COACH', 'COACH'), downloadVideo);

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/tags', getVideoTags);
router.get('/', getVideos);
router.post('/upload', uploadVideo);
router.post('/upload/file/init', initDirectUpload);
router.post('/upload/file/complete', completeDirectUpload);
router.post('/upload/file', (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Video file is too large (max 500MB).'
        : err.message;
      return res.status(400).json({ error: message });
    }
    next();
  });
}, uploadVideoFile);
router.post('/insert-youtube', authorize('HEAD_COACH'), insertYouTubeVideo);
router.post('/snippet', saveSnippet);
router.patch('/:id/tags', addTags);
router.delete('/:id', deleteVideo);

module.exports = router;
