# Vipps Login Backend API

Simple overview of the backend for Vipps Login.

---

## 1. Base URL

For local development:

- **Base URL**: `http://localhost:3000`

All auth routes are under `/auth`.

---

## 2. Endpoints Overview

- `GET /auth/health` – Health check
- `GET /auth/vipps/login` – Start Vipps login, returns `authUrl` and `sessionId`
- `GET /auth/vipps/callback` – Vipps redirects here after user login (used by Vipps, not by Postman)
- `POST /auth/vipps/session` – Exchange `sessionId` for JWT and user info (used by iOS app)
- `POST /auth/logout` – Logout and delete session

---

## 3. Testing with Postman

### 3.1 Health Check

- **Method**: GET
- **URL**: `http://localhost:3000/auth/health`
- **Headers**: none required

**Expected Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

---

### 3.2 Start Vipps Login

This simulates the app asking the backend to start a Vipps login.

- **Method**: GET
- **URL**: `http://localhost:3000/auth/vipps/login`
- **Headers**: none required

**Expected Response (200):**
```json
{
  "authUrl": "https://apitest.vipps.no/access-management-1.0/access/oauth2/auth?...",
  "sessionId": "<uuid>"
}
```

- `authUrl`: open this URL in browser / app to start Vipps login.
- `sessionId`: used later by the iOS app.

> In real flow, the **user is redirected to Vipps**, logs in, and Vipps calls the `/auth/vipps/callback` endpoint. This is hard to fully simulate in Postman, but the iOS app will handle this flow.

---

### 3.3 Get Session and JWT (after successful login)

Once Vipps has redirected back and the backend has stored tokens + user in the session, the iOS app calls this endpoint.

You can test it in Postman by using a known `sessionId` from `/auth/vipps/login` **after** a successful login.

- **Method**: POST
- **URL**: `http://localhost:3000/auth/vipps/session`
- **Headers**:
  - `Content-Type: application/json`
- **Body (raw JSON)**:
```json
{
  "sessionId": "<session-id-from-login>"
}
```

**Successful Response (200):**
```json
{
  "token": "<jwt-token>",
  "refreshToken": "<refresh-token>",
  "user": { "...user fields from Vipps..." },
  "expiresAt": "2025-01-08T12:00:00.000Z"
}
```

- `token`: JWT access token, signed with `JWT_SECRET`.
- `refreshToken`: random ID you can store in the app if you later add refresh logic.
- `user`: user profile from Vipps.
- `expiresAt`: when the JWT will expire.

**Error Responses:**
- `401` – `{ "error": "Session not found or expired" }`
- `400` – `{ "error": "sessionId is required" }`

---

### 3.4 Logout

- **Method**: POST
- **URL**: `http://localhost:3000/auth/logout`
- **Headers**:
  - `Content-Type: application/json`
- **Body (raw JSON)**:
```json
{
  "sessionId": "<session-id-from-login>"
}
```

**Successful Response (200):**
```json
{
  "success": true
}
```

---

## 4. iOS App Flow (High-Level)

This is how your iOS app should talk to this backend.

### Step 1: Start Login (Call Backend)

1. iOS app calls **`GET /auth/vipps/login`**.
2. Backend returns:
   - `authUrl` – Vipps URL
   - `sessionId` – backend session ID
3. App **saves `sessionId` locally** (e.g. in memory or secure storage).
4. App **opens `authUrl`** in browser / SFSafariViewController.

### Step 2: User Logs In with Vipps

1. User is in Vipps app / web.
2. After user approves, Vipps redirects the browser to:
   - `http://localhost:3000/auth/vipps/callback?code=...&state=...`
3. The backend:
   - Validates `state` with stored session.
   - Calls Vipps token endpoint and userinfo endpoint.
   - Stores tokens + user info in the session.
   - Redirects to your app:
     - `APP_REDIRECT_SCHEME://auth/callback?success=true&sessionId=<sessionId>`

> You must register `APP_REDIRECT_SCHEME` (e.g. `myapp`) as a URL scheme in Xcode so your app can receive this callback.

### Step 3: Handle Callback in iOS

When your app is opened with a URL like:

```text
myapp://auth/callback?success=true&sessionId=<sessionId>
```

1. Parse the URL query parameters:
   - `success`
   - `sessionId`
   - `error` (if any)
2. If `success=false`, show error to user.
3. If `success=true` and you have a `sessionId`:
   - Call **`POST /auth/vipps/session`** with:
     - Body: `{ "sessionId": "<sessionId-from-url>" }`
   - Backend returns:
     - `token` (JWT)
     - `refreshToken`
     - `user`
     - `expiresAt`
4. Store `token` and `refreshToken` securely (e.g. Keychain).

### Step 4: Use JWT for Authenticated Requests

For your own protected APIs (not yet implemented here):

- Add `Authorization` header:

```http
Authorization: Bearer <token>
```

- On the backend, you would create a middleware that verifies the JWT with `JWT_SECRET` and attaches `req.user`.

---

## 5. Environment Variables Required

Make sure `.env` has these values set (example):

```env
PORT=3000
NODE_ENV=development

VIPPS_CLIENT_ID=your_client_id_here
VIPPS_CLIENT_SECRET=your_client_secret_here
VIPPS_SUBSCRIPTION_KEY=your_subscription_key_here
VIPPS_MERCHANT_SERIAL_NUMBER=your_merchant_serial_number_here
VIPPS_API_URL=https://apitest.vipps.no
VIPPS_REDIRECT_URI=http://localhost:3000/auth/vipps/callback
APP_REDIRECT_SCHEME=yourappscheme
JWT_SECRET=change_this_to_a_random_secret_key_at_least_32_chars
```

Once these are set, you can:

1. Run `npm run dev`.
2. Test endpoints with Postman.
3. Implement the iOS flow exactly as described above.
