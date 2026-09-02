const express = require('express');
const router = express.Router();
const {
  listWhiteboardItems,
  createWhiteboardItem,
  moveWhiteboardItem,
  deleteWhiteboardItem
} = require('../controllers/whiteboardController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/', listWhiteboardItems);
router.post('/', createWhiteboardItem);
router.patch('/:id', moveWhiteboardItem);
router.delete('/:id', deleteWhiteboardItem);

module.exports = router;
