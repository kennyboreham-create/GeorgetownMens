const multer = require('multer');
const { getIncomingDir, ensureDirSync, incomingFilename } = require('../utils/localVideoStorage');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = getIncomingDir();
        ensureDirSync(dir);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => cb(null, incomingFilename(file))
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only video files are allowed.'));
  }
});

const playbookMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype
      && (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'));
    if (ok) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image or video files are allowed.'));
  }
});

module.exports = {
  uploadVideoFile: upload.single('video'),
  uploadPlaybookMedia: playbookMedia.single('file')
};
