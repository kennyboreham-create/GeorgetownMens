const Video = require('../models/Video');
const Assignment = require('../models/Assignment');
const { isR2Configured, deleteR2Object } = require('./r2VideoStorage');

/**
 * Delete a library video for a team.
 * Originals: remove R2 bytes, child snippets, and related assignments.
 * Snippets: remove only that snippet row and its assignments.
 */
async function deleteLibraryVideo(videoId, teamId) {
  const video = await Video.findOne({ _id: videoId, teamId });
  if (!video) return null;

  if (video.isSnippet) {
    await Assignment.deleteMany({ videoId: video._id });
    await Video.deleteOne({ _id: video._id });
    return {
      title: video.title,
      isSnippet: true,
      deletedSnippets: 0,
      removedFromR2: false
    };
  }

  const snippets = await Video.find({
    parentVideoId: video._id,
    teamId
  }).select('_id').lean();
  const snippetIds = snippets.map((row) => row._id);
  const removeIds = [video._id, ...snippetIds];

  let removedFromR2 = false;
  if (video.r2ObjectKey && String(video.r2ObjectKey).trim()) {
    if (!isR2Configured()) {
      throw new Error('Cloudflare R2 is not configured; the original file was not deleted.');
    }
    removedFromR2 = await deleteR2Object(video.r2ObjectKey);
  }

  await Assignment.deleteMany({ videoId: { $in: removeIds } });
  await Video.deleteMany({ _id: { $in: removeIds } });

  return {
    title: video.title,
    isSnippet: false,
    deletedSnippets: snippetIds.length,
    removedFromR2
  };
}

module.exports = {
  deleteLibraryVideo
};
