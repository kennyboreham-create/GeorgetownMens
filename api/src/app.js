const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5500'
];

const corsAllowedOrigins = new Set(defaultDevOrigins);

function addOrigin(value) {
  const trimmed = String(value || '').trim().replace(/\/$/, '');
  if (trimmed) corsAllowedOrigins.add(trimmed);
}

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach(addOrigin);
}
if (process.env.PUBLIC_API_URL) addOrigin(process.env.PUBLIC_API_URL);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');

    if (
      corsAllowedOrigins.has(normalizedOrigin) ||
      normalizedOrigin.endsWith('.web.app') ||
      normalizedOrigin.endsWith('.firebaseapp.com')
    ) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true
};

app.use(cors(corsOptions));

// Route imports
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const videoRoutes = require('./routes/videoRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const goalRoutes = require('./routes/goalRoutes');
const coachGoalRoutes = require('./routes/coachGoalRoutes');
const playerRoutes = require('./routes/playerRoutes');
const noteRoutes = require('./routes/noteRoutes');
const whiteboardRoutes = require('./routes/whiteboardRoutes');
const playbookRoutes = require('./routes/playbookRoutes');
const skillsLibraryRoutes = require('./routes/skillsLibraryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { handlePayPalSubscriptionWebhook } = require('./controllers/teamController');
const { paypalReady, webhookPublicUrl } = require('./utils/paypalSubscription');

// Mount API routes
app.use('/api/auth', authRoutes);
app.post('/api/billing/paypal-webhook', handlePayPalSubscriptionWebhook);
app.use('/api/team', teamRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/coach-goals', coachGoalRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/whiteboard', whiteboardRoutes);
app.use('/api/playbook', playbookRoutes);
app.use('/api/skills-library', skillsLibraryRoutes);
app.use('/api/admin', adminRoutes);

// Health check for Firebase / local process managers
app.get('/api/health', (req, res) => {
  const { readAdminEnv } = require('./utils/ensureAdminUser');
  const { adapterKind } = require('./db/odm');
  const admin = readAdminEnv();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: adapterKind(),
    storage: 'cloudflare-r2',
    features: {
      playbook: true,
      notes: true,
      whiteboard: true
    },
    adminConfigured: Boolean(admin.email && admin.password && admin.password.length >= 8),
    paypalConfigured: paypalReady(),
    paypalWebhook: webhookPublicUrl()
  });
});

// Inject API config before static assets (overrides public/js/config.js)
app.get('/js/config.js', (req, res) => {
  const publicBase = (process.env.PUBLIC_API_URL || process.env.FRONTEND_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  const apiBase = publicBase ? `${publicBase}/api` : '/api';

  res.type('application/javascript');
  res.send(
    `window.API_BASE_URL = window.API_BASE_URL || '${apiBase}';\n` +
    `window.APP_ORIGIN = window.location.origin;\n`
  );
});

const isCloudFunction = Boolean(process.env.FUNCTION_TARGET || process.env.K_SERVICE);
if (!isCloudFunction) {
  app.use(express.static(path.join(process.cwd(), '../frontend/public')));
}

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// JSON error handler (prevents HTML "Internal Server Error" pages)
app.use((err, req, res, next) => {
  console.error('[Express Error]', err.message);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'Video file is too large (max 500MB).'
    : (err.message || 'Internal Server Error');

  res.status(status).json({
    error: message
  });
});

module.exports = app;
