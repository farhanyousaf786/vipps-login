const express = require('express');
const jwt = require('jsonwebtoken');
const { generateState, generateSessionId } = require('../utils/helpers');
const {
  createAuthSession,
  getSessionByState,
  getSessionById,
  updateSession,
  deleteSession
} = require('../services/sessionService');
const {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo
} = require('../services/vippsService');

const { JWT_SECRET, APP_REDIRECT_SCHEME } = process.env;

const router = express.Router();

router.get('/vipps/login', (req, res) => {
  try {
    const state = generateState();
    const sessionId = createAuthSession(state);
    const authUrl = getAuthorizationUrl(state);

    res.json({ authUrl, sessionId });
  } catch (error) {
    console.error('Vipps login error:', error);
    res.status(500).json({ error: 'Failed to start Vipps login flow' });
  }
});

router.get('/vipps/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  try {
    if (error) {
      const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent(error_description || error)}`;
      return res.redirect(redirectUrl);
    }

    const session = getSessionByState(state);

    if (!session) {
      const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent('Invalid or expired state')}`;
      return res.redirect(redirectUrl);
    }

    const tokens = await exchangeCodeForTokens(code);
    const userInfo = await getUserInfo(tokens.access_token);

    updateSession(session.id, {
      vippsAccessToken: tokens.access_token,
      vippsRefreshToken: tokens.refresh_token,
      user: userInfo
    });

    const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=true&sessionId=${session.id}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Vipps callback error:', err);
    const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent(err.message)}`;
    res.redirect(redirectUrl);
  }
});

router.post('/vipps/session', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = getSessionById(sessionId);

    if (!session || !session.user) {
      return res.status(401).json({ error: 'Session not found or expired' });
    }

    const expiresInDays = 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const tokenPayload = {
      sub: session.user.sub,
      user: session.user
    };

    const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: `${expiresInDays}d` });
    const refreshToken = generateSessionId();

    res.json({
      token: jwtToken,
      refreshToken,
      user: session.user,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Session retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

router.post('/logout', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    deleteSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
