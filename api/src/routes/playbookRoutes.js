const express = require('express');
const router = express.Router();
const {
  getMyPlaybook,
  getShareMeta,
  createPlaybook,
  updatePlaybookPassword,
  accessPlaybook,
  getEditorContent,
  getPublicContent,
  updateSections,
  createBlock,
  updateBlock,
  deleteBlock,
  dismissComingSoon,
  uploadBlockMedia,
  streamBlockMedia,
  getTeamShareToken
} = require('../controllers/playbookController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { playbookViewAuth } = require('../middleware/playbookAuthMiddleware');
const { uploadPlaybookMedia } = require('../middleware/uploadMiddleware');

// Public
router.get('/meta/:shareToken', getShareMeta);
router.post('/access', accessPlaybook);
router.get('/media/:blockId', streamBlockMedia);
router.get('/view', playbookViewAuth, getPublicContent);

// Coach JWT
router.use(protect);
router.get('/me', authorize('HEAD_COACH', 'COACH'), getMyPlaybook);
router.get('/team-share', authorize('HEAD_COACH', 'COACH'), getTeamShareToken);

router.post('/', authorize('HEAD_COACH'), createPlaybook);
router.patch('/password', authorize('HEAD_COACH'), updatePlaybookPassword);
router.get('/editor', authorize('HEAD_COACH'), getEditorContent);
router.patch('/sections', authorize('HEAD_COACH'), updateSections);
router.patch('/coming-soon', authorize('HEAD_COACH'), dismissComingSoon);
router.post('/blocks', authorize('HEAD_COACH'), createBlock);
router.patch('/blocks/:id', authorize('HEAD_COACH'), updateBlock);
router.delete('/blocks/:id', authorize('HEAD_COACH'), deleteBlock);
router.post('/blocks/:id/media', authorize('HEAD_COACH'), (req, res, next) => {
  uploadPlaybookMedia(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, uploadBlockMedia);

module.exports = router;
