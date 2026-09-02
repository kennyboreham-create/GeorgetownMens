const fsp = require('fs/promises');
const path = require('path');
const Video = require('../models/Video');
const Assignment = require('../models/Assignment');

const diskOnlyFilter = {
  localFilePath: { $exists: true, $nin: [null, ''] },
  $or: [
    { r2ObjectKey: { $exists: false } },
    { r2ObjectKey: null },
    { r2ObjectKey: '' }
  ]
};

async function removeTreeQuietly(targetPath) {
  if (!targetPath) return;
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore missing local/ephemeral files
  }
}

/**
 * Drop disk-only library originals and their snippets/assignments.
 * Videos already in R2 keep their Firestore row; localFilePath is cleared.
 */
async function purgeDiskOnlyVideos() {
  const r2WithDisk = await Video.find({
    localFilePath: { $exists: true, $nin: [null, ''] },
    r2ObjectKey: { $exists: true, $nin: [null, ''] }
  }).select('_id localFilePath').lean();

  for (const video of r2WithDisk) {
    await Video.updateOne({ _id: video._id }, { $unset: { localFilePath: 1 } });
  }

  const diskOnly = await Video.find(diskOnlyFilter).select('_id localFilePath').lean();
  const originalIds = diskOnly.map((video) => video._id);

  const snippets = originalIds.length
    ? await Video.find({ parentVideoId: { $in: originalIds } }).select('_id').lean()
    : [];
  const snippetIds = snippets.map((video) => video._id);
  const removeIds = [...originalIds, ...snippetIds];

  let assignmentsDeleted = 0;
  if (removeIds.length) {
    const assignmentResult = await Assignment.deleteMany({ videoId: { $in: removeIds } });
    assignmentsDeleted = assignmentResult.deletedCount || 0;
    await Video.deleteMany({ _id: { $in: removeIds } });
  }

  const leftoverDir = path.resolve(process.env.VIDEO_STORAGE_DIR || path.join(process.cwd(), 'uploads', 'videos'));
  await removeTreeQuietly(leftoverDir);

  return {
    clearedR2LocalPath: r2WithDisk.length,
    deletedOriginals: originalIds.length,
    deletedSnippets: snippetIds.length,
    deletedAssignments: assignmentsDeleted
  };
}

module.exports = {
  diskOnlyFilter,
  purgeDiskOnlyVideos
};
