require('dotenv').config();
const app = require('./src/app');
const { connectDB, shouldUseMemory, hasFirebaseCredentials } = require('./src/db/odm');
const { runStartupJobs } = require('./src/startup');

const PORT = process.env.PORT || 5000;

const requiredEnv = ['JWT_SECRET'];
const recommendedEnv = [
  'RESEND_API_KEY',
  'FRONTEND_URL',
  'EMAIL_FROM',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET'
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
const missingRecommended = recommendedEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`[Server] Missing required environment variables: ${missingEnv.join(', ')}`);
}
if (missingRecommended.length) {
  console.warn(`[Server] Missing recommended environment variables: ${missingRecommended.join(', ')}`);
}
if (!shouldUseMemory() && !hasFirebaseCredentials()) {
  console.error('[Server] Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS, or FIRESTORE_IN_MEMORY=1 for local/dev.');
}

connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on port ${PORT}`);
    if (process.env.PUBLIC_API_URL) {
      console.log(`[Server] Public URL: ${process.env.PUBLIC_API_URL}`);
    }
    console.log(`[Server] EMAIL_FROM: ${process.env.EMAIL_FROM || '(not set — using default)'}`);
  });
  runStartupJobs();
});
