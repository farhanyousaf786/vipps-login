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

// DEBUG: Log ALL requests to callback for troubleshooting
router.use('/vipps/callback', (req, res, next) => {
  console.log('\n=== CALLBACK REQUEST RECEIVED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Query:', req.query);
  console.log('Headers:', {
    'user-agent': req.get('user-agent'),
    'referer': req.get('referer'),
    'host': req.get('host')
  });
  console.log('================================\n');
  next();
});

router.get('/vipps/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  console.log('\n=== VIPPS CALLBACK RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Query Parameters:', { code: code ? '***' : 'missing', state, error, error_description });
  console.log('APP_REDIRECT_SCHEME:', APP_REDIRECT_SCHEME);
  console.log('Full URL:', req.originalUrl);

  try {
    if (error) {
      console.log('Error from Vipps:', error_description || error);
      const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent(error_description || error)}`;
      console.log('Redirecting to app with error:', redirectUrl);
      return res.redirect(redirectUrl);
    }

    if (!code) {
      console.error('❌ Missing authorization code');
      const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent('Missing authorization code')}`;
      return res.redirect(redirectUrl);
    }

    if (!state) {
      console.error('❌ Missing state parameter');
      const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent('Missing state parameter')}`;
      return res.redirect(redirectUrl);
    }

    const session = getSessionByState(state);
    console.log('Session lookup result:', session ? `Found session ${session.id}` : 'Session not found');

    if (!session) {
      console.error('❌ Invalid or expired state:', state);
      const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent('Invalid or expired state')}`;
      return res.redirect(redirectUrl);
    }

    console.log('Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code);
    console.log('✓ Tokens received');

    console.log('Fetching user info...');
    const userInfo = await getUserInfo(tokens.access_token);
    console.log('✓ User info retrieved:', userInfo.sub);

    updateSession(session.id, {
      vippsAccessToken: tokens.access_token,
      vippsRefreshToken: tokens.refresh_token,
      user: userInfo
    });
    console.log('✓ Session updated with user data');

    const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=true&sessionId=${session.id}`;
    console.log('Redirecting to app:', redirectUrl);
    console.log('=== CALLBACK COMPLETE ===\n');
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('❌ Vipps callback error:', err.message);
    console.error('Stack:', err.stack);
    const safeError = process.env.NODE_ENV === 'development' ? err.message : 'Authentication failed';
    const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent(safeError)}`;
    console.log('Redirecting to app with error:', redirectUrl);
    res.redirect(redirectUrl);
  }
});

router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = getSessionById(sessionId);

    if (!session || !session.user) {
      return res.status(401).json({ error: 'Session not found or expired' });
    }

    res.json({
      success: true,
      user: session.user,
      authenticated: true
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ error: 'Failed to check session' });
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
    res.status(500).json({ error: 'Failed to create session' });
  }
});

function handleSignout(req, res) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const deleted = deleteSession(sessionId);

    return res.json({
      success: deleted,
      message: deleted ? 'Signed out' : 'Session not found'
    });
  } catch (error) {
    console.error('Signout error:', error);
    return res.status(500).json({ error: 'Failed to sign out' });
  }
}

router.post('/signout', handleSignout);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TEST ENDPOINT: Simulate callback for debugging (development only)
router.get('/test/callback', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoint not available in production' });
  }

  const { sessionId, success, error } = req.query;

  console.log('\n=== TEST CALLBACK ENDPOINT ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Parameters:', { sessionId, success, error });

  if (!sessionId) {
    return res.status(400).json({ 
      error: 'sessionId is required',
      example: '/auth/test/callback?sessionId=xxx&success=true'
    });
  }

  if (success === 'false' || error) {
    const errorMsg = error || 'User cancelled';
    const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=false&error=${encodeURIComponent(errorMsg)}`;
    console.log('Simulating error callback');
    console.log('Redirect URL:', redirectUrl);
    return res.json({
      message: 'Test callback simulated',
      redirectUrl,
      note: 'In your app, handle this deep link to show error'
    });
  }

  const session = getSessionById(sessionId);
  
  if (!session) {
    return res.status(404).json({ 
      error: 'Session not found',
      note: 'Make sure to call /auth/vipps/login first to create a session'
    });
  }

  if (!session.user) {
    return res.status(400).json({
      error: 'Session exists but has no user data',
      note: 'In production, user data is populated after Vipps callback. For testing, you can manually set it.',
      sessionData: session
    });
  }

  const redirectUrl = `${APP_REDIRECT_SCHEME}://auth/callback?success=true&sessionId=${sessionId}`;
  console.log('Simulating success callback');
  console.log('Redirect URL:', redirectUrl);
  console.log('=== TEST CALLBACK COMPLETE ===\n');

  res.json({
    message: 'Test callback simulated',
    redirectUrl,
    sessionData: {
      id: session.id,
      user: session.user,
      authenticated: true
    },
    note: 'In your app, handle this deep link to proceed with authentication'
  });
});

// TEST ENDPOINT: Manually populate session with test user (development only)
router.post('/test/populate-session', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoint not available in production' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const session = getSessionById(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Populate with test user data
  const testUser = {
    sub: '4712345678',
    name: 'Test User',
    email: 'test@example.com',
    phoneNumber: '+4712345678',
    address: {
      streetAddress: 'Test Street 1',
      postalCode: '0123',
      region: 'Oslo',
      country: 'NO'
    },
    birthDate: '1990-01-01'
  };

  updateSession(sessionId, {
    vippsAccessToken: 'test_access_token_' + Date.now(),
    vippsRefreshToken: 'test_refresh_token_' + Date.now(),
    user: testUser
  });

  console.log('✓ Test session populated with user data');

  res.json({
    message: 'Session populated with test user',
    sessionId,
    user: testUser,
    nextSteps: [
      `1. Call GET /auth/session/${sessionId} to verify session`,
      `2. Call POST /auth/vipps/session with { "sessionId": "${sessionId}" } to get JWT token`,
      `3. Or call GET /auth/test/callback?sessionId=${sessionId}&success=true to simulate callback`
    ]
  });
});

module.exports = router;
