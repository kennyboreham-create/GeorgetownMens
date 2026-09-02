const { purgeDiskOnlyVideos } = require('./utils/purgeDiskOnlyVideos');
const { ensureAdminUser } = require('./utils/ensureAdminUser');
const { seedSubscriptionPlaybooks } = require('./utils/seedSubscriptionPlaybooks');
const { ensurePayPalCatalog, paypalReady } = require('./utils/paypalSubscription');

function runStartupJobs() {
  return Promise.allSettled([
    purgeDiskOnlyVideos().then((purged) => {
      console.log(
        `[Storage] Removed disk-only library videos: originals=${purged.deletedOriginals} snippets=${purged.deletedSnippets} assignments=${purged.deletedAssignments} r2LocalPathCleared=${purged.clearedR2LocalPath}`
      );
    }),
    ensureAdminUser(),
    seedSubscriptionPlaybooks(),
    paypalReady()
      ? ensurePayPalCatalog().then((catalog) => {
        if (catalog.ok) {
          console.log(`[PayPal] Catalog ready. Plans: ${Object.values(catalog.planIds || {}).join(', ') || 'none'}`);
        } else {
          console.warn(`[PayPal] Catalog skipped: ${catalog.reason}`);
        }
      })
      : Promise.resolve()
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error(`[Startup] Background task failed: ${result.reason?.message || result.reason}`);
      }
    });
  });
}

module.exports = { runStartupJobs };
