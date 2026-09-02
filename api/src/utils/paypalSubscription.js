const { getPlan, canonicalPlanId, canonicalInterval, listPlanOffers } = require('./storagePlans');

const OFFER_KEYS = ['plus:monthly', 'plus:yearly', 'premium:monthly', 'premium:yearly'];
const PRODUCT_NAME = 'Coaching Hockey Made Easy storage';

function envText(env, key, fallback = '') {
  return String(env[key] ?? fallback).trim();
}

function paypalMode(env = process.env) {
  return envText(env, 'PAYPAL_MODE', 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
}

function paypalApiBase(env = process.env) {
  return paypalMode(env) === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function paypalCurrency(env = process.env) {
  const code = envText(env, 'PAYPAL_CURRENCY', 'USD').toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'USD';
}

function paypalReady(env = process.env) {
  return Boolean(envText(env, 'PAYPAL_CLIENT_ID') && envText(env, 'PAYPAL_CLIENT_SECRET'));
}

function appOrigin(env = process.env) {
  const raw = envText(env, 'FRONTEND_URL')
    || envText(env, 'PUBLIC_API_URL')
    || 'http://localhost:5000';
  return raw.split(',')[0].trim().replace(/\/$/, '');
}

function webhookPublicUrl(env = process.env) {
  const backend = envText(env, 'PUBLIC_API_URL')
    || envText(env, 'BACKEND_URL')
    || appOrigin(env);
  return `${backend.replace(/\/$/, '')}/api/billing/paypal-webhook`;
}

function offerKey(planId, interval) {
  return `${canonicalPlanId(planId)}:${canonicalInterval(interval)}`;
}

function envPlanIdKey(planId, interval) {
  const plan = canonicalPlanId(planId).toUpperCase();
  const billing = canonicalInterval(interval).toUpperCase();
  return `PAYPAL_PLAN_${plan}_${billing}`;
}

function readConfiguredPlanIds(env = process.env) {
  const ids = {};
  for (const key of OFFER_KEYS) {
    const [plan, interval] = key.split(':');
    const id = envText(env, envPlanIdKey(plan, interval));
    if (id) ids[key] = id;
  }
  return ids;
}

function checkoutPayload(planId, interval, env = process.env) {
  const plan = getPlan(planId);
  const billing = canonicalInterval(interval);
  const ready = paypalReady(env);
  return {
    provider: 'paypal',
    ready,
    plan: plan.id,
    interval: billing,
    url: null,
    message: ready
      ? `Continue to PayPal to start this ${billing} plan.`
      : 'PayPal checkout is not connected yet. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the backend, then redeploy.'
  };
}

function priceValue(plan, interval) {
  const resolved = typeof plan === 'string' ? getPlan(plan) : plan;
  const cents = canonicalInterval(interval) === 'yearly' ? resolved.yearlyCents : resolved.monthlyCents;
  return (Number(cents) / 100).toFixed(2);
}

function resolveOfferFromPlanId(planId, env = process.env) {
  const configured = readConfiguredPlanIds(env);
  const match = Object.entries(configured).find(([, id]) => id && id === planId);
  if (!match) return { plan: null, interval: 'monthly' };
  const [plan, interval] = match[0].split(':');
  return { plan, interval };
}

function parsePayPalSubscriptionEvent(body = {}, env = process.env) {
  if (body.teamId && (body.plan || body.subscriptionPlan)) {
    return {
      teamId: String(body.teamId),
      plan: String(body.plan || body.subscriptionPlan),
      interval: String(body.interval || body.subscriptionInterval || 'monthly'),
      status: String(body.status || body.subscriptionStatus || 'active'),
      paypalSubscriptionId: body.paypalSubscriptionId || body.subscriptionId || null,
      paypalPayerId: body.paypalPayerId || body.payerId || null
    };
  }

  const eventType = String(body.event_type || body.eventType || '');
  const resource = body.resource || body.object || {};
  const subscription = resource.id || resource.plan_id || resource.custom_id
    ? resource
    : (resource.subscription || resource);
  const subscriptionId = subscription.id || resource.billing_agreement_id || null;
  const offer = resolveOfferFromPlanId(subscription.plan_id, env);

  const canceled = /CANCELLED|SUSPENDED|EXPIRED/i.test(eventType)
    || /CANCELLED|SUSPENDED|EXPIRED/i.test(subscription.status || '');
  const active = /ACTIVATED|APPROVED|RE-ACTIVATED|SALE.COMPLETED/i.test(eventType)
    || /ACTIVE|APPROVED/i.test(subscription.status || '');

  if (!subscriptionId && !subscription.custom_id) return null;

  return {
    teamId: subscription.custom_id || subscription.customId || resource.custom_id || null,
    plan: offer.plan,
    interval: offer.interval,
    status: canceled ? 'canceled' : (active ? 'active' : String(subscription.status || '').toLowerCase()),
    paypalSubscriptionId: subscriptionId,
    paypalPayerId: subscription.subscriber?.payer_id || resource.payer_id || null,
    eventType,
    paypalPlanId: subscription.plan_id || null
  };
}

let tokenCache = { token: '', expiresAt: 0 };

function resetPayPalClientCache() {
  tokenCache = { token: '', expiresAt: 0 };
}

async function getAccessToken(env = process.env, fetchImpl = fetch) {
  if (!paypalReady(env)) {
    const error = new Error('PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
    error.status = 503;
    throw error;
  }
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(
    `${envText(env, 'PAYPAL_CLIENT_ID')}:${envText(env, 'PAYPAL_CLIENT_SECRET')}`
  ).toString('base64');
  const response = await fetchImpl(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.message || 'PayPal authentication failed.');
    error.status = 502;
    throw error;
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, Number(data.expires_in) || 300) * 1000 - 15000
  };
  return tokenCache.token;
}

async function paypalRequest(path, { method = 'GET', body, env = process.env, fetchImpl = fetch } = {}) {
  const token = await getAccessToken(env, fetchImpl);
  const response = await fetchImpl(`${paypalApiBase(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }
  if (!response.ok) {
    const detail = Array.isArray(data.details) && data.details[0]
      ? data.details[0].description || data.details[0].issue
      : '';
    const error = new Error(detail || data.message || `PayPal request failed (${response.status}).`);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.paypal = data;
    throw error;
  }
  return data;
}

function catalogNames() {
  return Object.fromEntries(listPlanOffers().map((offer) => [
    `${offer.id}:${offer.interval}`,
    `CHME ${offer.label} ${offer.interval}`
  ]));
}

async function ensurePayPalCatalog(env = process.env, fetchImpl = fetch) {
  if (!paypalReady(env)) {
    return { ok: false, reason: 'missing_env', planIds: {} };
  }

  const configured = readConfiguredPlanIds(env);
  if (OFFER_KEYS.every((key) => configured[key])) {
    return { ok: true, created: false, planIds: configured };
  }

  const names = catalogNames();
  const products = await paypalRequest('/v1/catalogs/products?page_size=20&page=1', { env, fetchImpl });
  let product = (products.products || []).find((item) => item.name === PRODUCT_NAME);
  if (!product) {
    product = await paypalRequest('/v1/catalogs/products', {
      method: 'POST',
      env,
      fetchImpl,
      body: {
        name: PRODUCT_NAME,
        type: 'SERVICE',
        category: 'SOFTWARE',
        description: 'Team video storage and skills library for Coaching Hockey Made Easy.'
      }
    });
  }

  const plans = await paypalRequest(
    `/v1/billing/plans?product_id=${encodeURIComponent(product.id)}&page_size=20&page=1`,
    { env, fetchImpl }
  );
  const existingByName = Object.fromEntries((plans.plans || []).map((plan) => [plan.name, plan.id]));
  const planIds = { ...configured };

  for (const offer of listPlanOffers()) {
    const key = `${offer.id}:${offer.interval}`;
    if (planIds[key]) continue;
    if (existingByName[names[key]]) {
      planIds[key] = existingByName[names[key]];
      continue;
    }
    const created = await paypalRequest('/v1/billing/plans', {
      method: 'POST',
      env,
      fetchImpl,
      body: {
        product_id: product.id,
        name: names[key],
        status: 'ACTIVE',
        description: `${offer.label} ${offer.interval} storage plan`,
        billing_cycles: [{
          frequency: {
            interval_unit: offer.interval === 'yearly' ? 'YEAR' : 'MONTH',
            interval_count: 1
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: priceValue(offer.id, offer.interval),
              currency_code: paypalCurrency(env)
            }
          }
        }],
        payment_preferences: {
          auto_bill_outstanding: true,
          payment_failure_threshold: 3
        }
      }
    });
    planIds[key] = created.id;
  }

  console.log('[PayPal] Billing plans ready:', planIds);
  return { ok: true, created: true, productId: product.id, planIds };
}

async function createPayPalCheckout({ team, planId, interval, user, env = process.env, fetchImpl = fetch }) {
  const checkout = checkoutPayload(planId, interval, env);
  if (!checkout.ready) return checkout;

  const catalog = await ensurePayPalCatalog(env, fetchImpl);
  const key = offerKey(planId, interval);
  const paypalPlanId = catalog.planIds[key];
  if (!paypalPlanId) {
    const error = new Error('PayPal plan IDs are missing. Restart the backend after setting PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
    error.status = 503;
    throw error;
  }

  const origin = appOrigin(env);
  const created = await paypalRequest('/v1/billing/subscriptions', {
    method: 'POST',
    env,
    fetchImpl,
    body: {
      plan_id: paypalPlanId,
      custom_id: String(team._id),
      subscriber: user?.email ? { email_address: user.email } : undefined,
      application_context: {
        brand_name: 'Coaching Hockey Made Easy',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${origin}/paypal-return.html`,
        cancel_url: `${origin}/dashboard.html#tab-team-manage`
      }
    }
  });

  const approve = (created.links || []).find((link) => link.rel === 'approve');
  return {
    ...checkout,
    ready: Boolean(approve?.href),
    url: approve?.href || null,
    subscriptionId: created.id || null,
    message: approve?.href
      ? `Continue to PayPal to start ${getPlan(planId).label} (${canonicalInterval(interval)}).`
      : 'PayPal did not return a checkout link.'
  };
}

async function fetchPayPalSubscription(subscriptionId, env = process.env, fetchImpl = fetch) {
  if (!subscriptionId) return null;
  return paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, { env, fetchImpl });
}

function subscriptionToApplyPayload(subscription, env = process.env) {
  const parsed = parsePayPalSubscriptionEvent({
    event_type: subscription.status === 'ACTIVE' || subscription.status === 'APPROVED'
      ? 'BILLING.SUBSCRIPTION.ACTIVATED'
      : `BILLING.SUBSCRIPTION.${subscription.status}`,
    resource: subscription
  }, env);
  const configured = readConfiguredPlanIds(env);
  if ((!parsed.plan || parsed.plan === 'null') && subscription.plan_id) {
    const match = Object.entries(configured).find(([, id]) => id === subscription.plan_id);
    if (match) {
      const [plan, interval] = match[0].split(':');
      parsed.plan = plan;
      parsed.interval = interval;
    }
  }
  return parsed;
}

async function verifyPayPalWebhook(req, env = process.env, fetchImpl = fetch) {
  const webhookId = envText(env, 'PAYPAL_WEBHOOK_ID');
  if (!webhookId) {
    return { ok: false, skipped: true, reason: 'missing_webhook_id' };
  }
  const data = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    env,
    fetchImpl,
    body: {
      auth_algo: req.get('paypal-auth-algo'),
      cert_url: req.get('paypal-cert-url'),
      transmission_id: req.get('paypal-transmission-id'),
      transmission_sig: req.get('paypal-transmission-sig'),
      transmission_time: req.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: req.body
    }
  });
  return { ok: data.verification_status === 'SUCCESS', status: data.verification_status };
}

module.exports = {
  OFFER_KEYS,
  PRODUCT_NAME,
  paypalMode,
  paypalApiBase,
  paypalCurrency,
  paypalReady,
  appOrigin,
  webhookPublicUrl,
  offerKey,
  envPlanIdKey,
  readConfiguredPlanIds,
  resolveOfferFromPlanId,
  checkoutPayload,
  priceValue,
  parsePayPalSubscriptionEvent,
  resetPayPalClientCache,
  getAccessToken,
  paypalRequest,
  ensurePayPalCatalog,
  createPayPalCheckout,
  fetchPayPalSubscription,
  subscriptionToApplyPayload,
  verifyPayPalWebhook
};
