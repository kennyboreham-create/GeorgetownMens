const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10
});

let ready;

async function getApp() {
  if (!ready) {
    ready = (async () => {
      const { connectDB } = require('./src/db/odm');
      await connectDB();
      const { runStartupJobs } = require('./src/startup');
      runStartupJobs().catch((err) => {
        console.error('[Functions] Startup job failed:', err);
      });
      return require('./src/app');
    })();
  }
  return ready;
}

exports.api = onRequest(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 3600,
    concurrency: 20,
    cors: false,
    invoker: 'public'
  },
  async (req, res) => {
    const app = await getApp();
    return app(req, res);
  }
);
