const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { protect, authorize } = require('../middleware/authMiddleware');
const { streamAuth } = require('../middleware/streamAuthMiddleware');
const { uploadPlaybookMedia } = require('../middleware/uploadMiddleware');
const {
  listVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  listPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  getAdminCatalog,
  getPlaybookEditor,
  updatePlaybookSections,
  dismissPlaybookComingSoon,
  createPlaybookBlock,
  deletePlaybookBlock,
  uploadPlaybookBlockMedia,
  streamPlaybookBlockMedia
} = require('../controllers/adminLibraryController');

router.get('/playbooks/:id/media/:blockId', streamAuth, authorize('ADMIN'), asyncHandler(streamPlaybookBlockMedia));

router.use(protect);
router.use(authorize('ADMIN'));

router.get('/me', asyncHandler(getAdminCatalog));
router.get('/videos', asyncHandler(listVideos));
router.post('/videos', asyncHandler(createVideo));
router.patch('/videos/:id', asyncHandler(updateVideo));
router.delete('/videos/:id', asyncHandler(deleteVideo));
router.get('/playbooks', asyncHandler(listPlaybooks));
router.post('/playbooks', asyncHandler(createPlaybook));
router.get('/playbooks/:id/editor', asyncHandler(getPlaybookEditor));
router.patch('/playbooks/:id/sections', asyncHandler(updatePlaybookSections));
router.patch('/playbooks/:id/coming-soon', asyncHandler(dismissPlaybookComingSoon));
router.post('/playbooks/:id/blocks', asyncHandler(createPlaybookBlock));
router.delete('/playbooks/:id/blocks/:blockId', asyncHandler(deletePlaybookBlock));
router.post('/playbooks/:id/blocks/:blockId/media', (req, res, next) => {
  uploadPlaybookMedia(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, asyncHandler(uploadPlaybookBlockMedia));
router.patch('/playbooks/:id', asyncHandler(updatePlaybook));
router.delete('/playbooks/:id', asyncHandler(deletePlaybook));

module.exports = router;
