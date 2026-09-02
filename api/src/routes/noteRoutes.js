const express = require('express');
const router = express.Router();
const {
  listCoachNotes,
  createCoachNote,
  toggleCoachNoteComplete,
  deleteCoachNote,
  listPlayerNotes,
  createPlayerNote,
  deletePlayerNote
} = require('../controllers/noteController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('HEAD_COACH', 'COACH'));

router.get('/players', listPlayerNotes);
router.post('/players', createPlayerNote);
router.delete('/players/:id', deletePlayerNote);

router.get('/', listCoachNotes);
router.post('/', createCoachNote);
router.patch('/:id/complete', toggleCoachNoteComplete);
router.delete('/:id', deleteCoachNote);

module.exports = router;
