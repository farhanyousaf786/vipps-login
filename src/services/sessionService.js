const { generateSessionId, getExpirationDate, isSessionExpired } = require('../utils/helpers');

// In-memory session storage
// Note: In production, use Redis or a database instead
const sessions = new Map();

// Create a new auth session with state
function createAuthSession(state) {
  const sessionId = generateSessionId();

  const session = {
    id: sessionId,
    state,
    vippsAccessToken: null,
    vippsRefreshToken: null,
    user: null,
    createdAt: new Date(),
    expiresAt: getExpirationDate(30) // Expires in 30 minutes (increased for OAuth flow)
  };

  sessions.set(sessionId, session);

  return sessionId;
}

// Find session by state (used in callback)
function getSessionByState(state) {
  for (const [id, session] of sessions) {
    if (session.state === state) {
      if (isSessionExpired(session)) {
        sessions.delete(id);
        return null;
      }
      return session;
    }
  }
  return null;
}

// Find session by ID
function getSessionById(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (isSessionExpired(session)) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

// Update session with tokens and user info
function updateSession(sessionId, data) {
  const session = sessions.get(sessionId);

  if (!session) {
    return false;
  }

  // Update session with new data
  if (data.vippsAccessToken) session.vippsAccessToken = data.vippsAccessToken;
  if (data.vippsRefreshToken) session.vippsRefreshToken = data.vippsRefreshToken;
  if (data.user) session.user = data.user;

  // Extend session expiration after successful login
  session.expiresAt = getExpirationDate(60); // Extend to 60 minutes

  sessions.set(sessionId, session);
  return true;
}

// Delete a session
function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

// Clean up expired sessions (call periodically)
function cleanExpiredSessions() {
  const now = new Date();
  let cleaned = 0;

  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      sessions.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} expired sessions`);
  }
}

// Start automatic cleanup every 5 minutes
setInterval(cleanExpiredSessions, 5 * 60 * 1000);

module.exports = {
  createAuthSession,
  getSessionByState,
  getSessionById,
  updateSession,
  deleteSession
};
