/**
 * Firebase Hosting serves this static site and rewrites /api/* to Cloud Functions.
 * Same-origin `/api` is the default. Override only if the API is on another host.
 */
window.API_BASE_URL = window.API_BASE_URL || '/api';
