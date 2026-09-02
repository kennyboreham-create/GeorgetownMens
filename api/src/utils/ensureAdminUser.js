const bcrypt = require('bcryptjs');
const User = require('../models/User');

function stripEnvQuotes(value) {
  let text = String(value ?? '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2)
    || (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function readAdminEnv(env = process.env) {
  const email = stripEnvQuotes(env.ADMIN_EMAIL).toLowerCase();
  const password = stripEnvQuotes(env.ADMIN_PASSWORD);
  const name = stripEnvQuotes(env.ADMIN_NAME) || 'Admin';
  return { email, password, name };
}

function canAccessAdmin(user) {
  return Boolean(user && (user.role === 'ADMIN' || user.isPlatformAdmin));
}

async function passwordAllowsAdmin(user, password, env = process.env) {
  const submitted = String(password || '');
  if (!user || !submitted) return false;

  if (user.password && await bcrypt.compare(submitted, user.password)) {
    return true;
  }
  if (user.adminPassword && await bcrypt.compare(submitted, user.adminPassword)) {
    return true;
  }

  const configured = readAdminEnv(env);
  if (
    configured.email
    && configured.password
    && configured.email === String(user.email || '').toLowerCase()
    && submitted === configured.password
  ) {
    return true;
  }

  return false;
}

async function ensureAdminUser(env = process.env) {
  const { email, password, name } = readAdminEnv(env);

  if (!email || !password) {
    console.warn('[Admin] ADMIN_EMAIL or ADMIN_PASSWORD is not set — admin login is unavailable.');
    return { ok: false, reason: 'missing_env' };
  }

  if (password.length < 8) {
    console.warn('[Admin] ADMIN_PASSWORD must be at least 8 characters — skipping admin bootstrap.');
    return { ok: false, reason: 'password_too_short' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user = await User.findOne({ email });

  if (!user) {
    user = new User({
      name,
      email,
      password: passwordHash,
      role: 'ADMIN',
      isVerified: true,
      isPlatformAdmin: true,
      adminPassword: passwordHash
    });
    await user.save();
    console.log(`[Admin] Created admin user ${email}`);
    return { ok: true, created: true, user };
  }

  user.isPlatformAdmin = true;
  user.isVerified = true;
  if (user.role === 'ADMIN') {
    user.name = name;
    if (!(await bcrypt.compare(password, user.password))) {
      user.password = passwordHash;
    }
  }
  if (!user.adminPassword || !(await bcrypt.compare(password, user.adminPassword))) {
    user.adminPassword = passwordHash;
  }
  await user.save();

  if (user.role !== 'ADMIN') {
    console.log(`[Admin] Granted platform admin on existing ${user.role} ${email}`);
  }
  return { ok: true, created: false, user };
}

module.exports = {
  stripEnvQuotes,
  readAdminEnv,
  canAccessAdmin,
  passwordAllowsAdmin,
  ensureAdminUser
};
