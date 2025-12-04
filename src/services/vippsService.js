const axios = require('axios');
const { createVippsAuthHeader } = require('../utils/helpers');

const {
  VIPPS_API_URL,
  VIPPS_CLIENT_ID,
  VIPPS_CLIENT_SECRET,
  VIPPS_REDIRECT_URI,
  VIPPS_MERCHANT_SERIAL_NUMBER,
  VIPPS_SUBSCRIPTION_KEY
} = process.env;

const VIPPS_HEADERS = {
  'Merchant-Serial-Number': VIPPS_MERCHANT_SERIAL_NUMBER,
  'Vipps-System-Name': 'vipps-login-app',
  'Vipps-System-Version': '1.0.0',
  'Vipps-System-Plugin-Name': 'express-backend',
  'Vipps-System-Plugin-Version': '1.0.0'
};

function getAuthorizationUrl(state) {
  const baseUrl = `${VIPPS_API_URL}/access-management-1.0/access/oauth2/auth`;
  const params = new URLSearchParams({
    client_id: VIPPS_CLIENT_ID,
    response_type: 'code',
    scope: 'openid name phoneNumber email address birthDate',
    state,
    redirect_uri: VIPPS_REDIRECT_URI
  });

  return `${baseUrl}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  try {
    const url = `${VIPPS_API_URL}/access-management-1.0/access/oauth2/token`;
    const headers = {
      ...VIPPS_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: createVippsAuthHeader(VIPPS_CLIENT_ID, VIPPS_CLIENT_SECRET)
    };

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: VIPPS_REDIRECT_URI
    });

    const response = await axios.post(url, body, { headers });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
}

async function getUserInfo(accessToken) {
  try {
    const url = `${VIPPS_API_URL}/vipps-userinfo-api/userinfo`;
    const headers = {
      ...VIPPS_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY
    };

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to retrieve Vipps user info: ${error.message}`);
  }
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo
};
