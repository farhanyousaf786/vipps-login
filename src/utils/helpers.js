const { v4: uuidv4 } = require('uuid');

// Generate a random state string for OAuth security
function generateState() {
  return uuidv4();
}

// Generate a random session ID
function generateSessionId() {
  return uuidv4();
}

// Base64 encode a string
function base64Encode(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Create the Basic Auth header for Vipps API
function createVippsAuthHeader(clientId, clientSecret) {
  const credentials = `${clientId}:${clientSecret}`;
  return `Basic ${base64Encode(credentials)}`;
}

// Check if a session has expired
function isSessionExpired(session) {
  return new Date() > session.expiresAt;
}

// Get expiration date (default 10 minutes from now)
function getExpirationDate(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = {
  generateState,
  generateSessionId,
  base64Encode,
  createVippsAuthHeader,
  isSessionExpired,
  getExpirationDate
};
