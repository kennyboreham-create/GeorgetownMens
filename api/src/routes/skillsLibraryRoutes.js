const express = require('express');
const router = express.Router();
const {
  getSkillsLibrary,
  getSubscriptionPlaybookView,
  streamSubscriptionPlaybookMedia
} = require('../controllers/skillsLibraryController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { streamAuth } = require('../middleware/streamAuthMiddleware');

router.get('/playbooks/:id/media/:blockId', streamAuth, authorize('HEAD_COACH', 'COACH'), streamSubscriptionPlaybookMedia);
router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));
router.get('/', getSkillsLibrary);
router.get('/playbooks/:id/view', getSubscriptionPlaybookView);

module.exports = router;
