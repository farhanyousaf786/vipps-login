# Vipps Login Backend API - Complete Guide

## 1. Base URLs

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:3000` |
| Production | `https://vipps-login-production.up.railway.app` |

All auth routes are under `/auth`.

---

## 2. Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/health` | Health check |
| GET | `/auth/vipps/login` | Start login, returns `authUrl` and `sessionId` |
| GET | `/auth/vipps/callback` | Vipps redirects here (not called by app) |
| POST | `/auth/vipps/session` | Exchange `sessionId` for JWT and user info |
| POST | `/auth/signout` | Sign out and delete session |

---

## 3. Prerequisites - Vipps Portal Setup

**You MUST complete these steps before login will work:**

### 3.1 Register Redirect URI in Vipps Portal

1. Go to [portal.vippsmobilepay.com](https://portal.vippsmobilepay.com)
2. Login to your account
3. Find your sales unit / application
4. Look for **"Redirect URIs"** or **"Login settings"**
5. Add this URL:
   ```
   https://vipps-login-production.up.railway.app/auth/vipps/callback
   ```
6. Save changes

**Important:** The redirect URI must match EXACTLY what's in your backend `.env` file.

### 3.2 Verify Your Credentials

Make sure you have these from Vipps portal:
- `client_id`
- `client_secret`
- `subscription_key` (Ocp-Apim-Subscription-Key)
- `merchant_serial_number`

---

## 4. iOS App Setup

### 4.1 Register URL Scheme in Xcode

Your app needs to handle the callback URL `osloinside://auth/callback`.

1. Open your Xcode project
2. Click on your project in the navigator
3. Select your target
4. Go to **"Info"** tab
5. Expand **"URL Types"**
6. Click **"+"** to add new URL type
7. Set:
   - **Identifier**: `com.yourcompany.osloinside`
   - **URL Schemes**: `osloinside`
   - **Role**: Editor

### 4.2 Handle Incoming URL in App

In your `App.swift` or `SceneDelegate`:

```swift
// SwiftUI App
@main
struct YourApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    handleVippsCallback(url)
                }
        }
    }
}

func handleVippsCallback(_ url: URL) {
    // url = osloinside://auth/callback?success=true&sessionId=xxx
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let success = components?.queryItems?.first(where: { $0.name == "success" })?.value
    let sessionId = components?.queryItems?.first(where: { $0.name == "sessionId" })?.value
    let error = components?.queryItems?.first(where: { $0.name == "error" })?.value
    
    if success == "true", let sessionId = sessionId {
        // Call POST /auth/vipps/session with sessionId
        fetchSession(sessionId: sessionId)
    } else {
        // Show error to user
        print("Login failed: \(error ?? "Unknown error")")
    }
}
```

---

## 5. Complete Login Flow

### Step 1: iOS App Starts Login

```
iOS App                         Backend                          Vipps
   |                               |                               |
   |-- GET /auth/vipps/login ----->|                               |
   |                               |                               |
   |<-- { authUrl, sessionId } ----|                               |
   |                               |                               |
   | (save sessionId locally)      |                               |
   |                               |                               |
   | (open authUrl in browser) ----------------------------------->|
   |                               |                               |
```

### Step 2: User Logs In with Vipps

```
iOS App                         Backend                          Vipps
   |                               |                               |
   |                               |                 (user logs in)|
   |                               |                               |
   |                               |<-- callback?code=xxx&state=yyy|
   |                               |                               |
   |                               |-- exchange code for tokens -->|
   |                               |                               |
   |                               |<-- access_token, user info ---|
   |                               |                               |
   |                               | (store in session)            |
   |                               |                               |
   |<-- redirect to osloinside://--|                               |
   |    ?success=true&sessionId=xx |                               |
```

### Step 3: iOS App Gets User Data

```
iOS App                         Backend                          Vipps
   |                               |                               |
   | (receives deep link)          |                               |
   |                               |                               |
   |-- POST /auth/vipps/session -->|                               |
   |   { sessionId: "xxx" }        |                               |
   |                               |                               |
   |<-- { token, user, expiresAt }-|                               |
   |                               |                               |
   | (save token in Keychain)      |                               |
   | (navigate to home screen)     |                               |
```

---

## 6. API Details

### 6.1 Health Check

**Request:**
```
GET /auth/health
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T22:00:00.000Z"
}
```

---

### 6.2 Start Login

**Request:**
```
GET /auth/vipps/login
```

**Response (200):**
```json
{
  "authUrl": "https://api.vipps.no/access-management-1.0/access/oauth2/auth?client_id=xxx&...",
  "sessionId": "ea6fae91-3cc4-4fd2-89de-874bec5c53de"
}
```

**iOS App should:**
1. Save `sessionId` locally
2. Open `authUrl` in Safari or ASWebAuthenticationSession

---

### 6.3 Callback (Handled by Backend)

This endpoint is called by Vipps, NOT by your app.

**URL:** `/auth/vipps/callback?code=xxx&state=yyy`

**Backend will:**
1. Verify state matches session
2. Exchange code for tokens with Vipps
3. Fetch user info from Vipps
4. Store in session
5. Redirect to: `osloinside://auth/callback?success=true&sessionId=xxx`

---

### 6.4 Get Session (Exchange for JWT)

**Request:**
```
POST /auth/vipps/session
Content-Type: application/json

{
  "sessionId": "ea6fae91-3cc4-4fd2-89de-874bec5c53de"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "abc123-refresh-token",
  "user": {
    "sub": "vipps-user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+4712345678"
  },
  "expiresAt": 1735689600000
}
```

**Error Responses:**
- `400`: `{ "error": "sessionId is required" }`
- `401`: `{ "error": "Session not found or expired" }`

---

### 6.5 Sign out

**Request:**
```
POST /auth/signout
Content-Type: application/json

{
  "sessionId": "ea6fae91-3cc4-4fd2-89de-874bec5c53de"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Signed out"
}
```

**Notes:**
- This deletes the server-side in-memory session.
- If your app stores a JWT from `/auth/vipps/session`, you must also delete it locally on sign out.
- Compatibility alias: `POST /auth/logout` is also supported and behaves the same as `/auth/signout`.

---

## 7. Testing

### 7.1 Test with Terminal (curl)

**Health check:**
```bash
curl https://vipps-login-production.up.railway.app/auth/health
```

**Start login:**
```bash
curl https://vipps-login-production.up.railway.app/auth/vipps/login
```

**Get session (after login):**
```bash
curl -X POST https://vipps-login-production.up.railway.app/auth/vipps/session \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "your-session-id-here"}'
```

### 7.2 Test Full Flow in Browser

1. Run:
   ```bash
   curl https://vipps-login-production.up.railway.app/auth/vipps/login
   ```

2. Copy the `authUrl` from response

3. Paste `authUrl` in browser

4. Login with Vipps on your phone

5. After approval, browser will try to open:
   ```
   osloinside://auth/callback?success=true&sessionId=xxx
   ```

6. Copy the `sessionId` from URL

7. Test session endpoint:
   ```bash
   curl -X POST https://vipps-login-production.up.railway.app/auth/vipps/session \
     -H "Content-Type: application/json" \
     -d '{"sessionId": "xxx"}'
   ```

---

## 8. Environment Variables

### Production (Railway)

```
NODE_ENV=production
VIPPS_CLIENT_ID=af53b2ae-ce05-4f3f-8c07-d26e2eee16b8
VIPPS_CLIENT_SECRET=XJ68Q~Yme-Af1vseAzTp6eSH4MCfYlhgkquIWart
VIPPS_SUBSCRIPTION_KEY=4440b081320bfdb544a301a8708d391c
VIPPS_MERCHANT_SERIAL_NUMBER=1028040
VIPPS_API_URL=https://api.vipps.no
VIPPS_REDIRECT_URI=https://vipps-login-production.up.railway.app/auth/vipps/callback
APP_REDIRECT_SCHEME=osloinside
JWT_SECRET=your-secret-key-here
```

### Local Development

```
NODE_ENV=development
VIPPS_CLIENT_ID=af53b2ae-ce05-4f3f-8c07-d26e2eee16b8
VIPPS_CLIENT_SECRET=XJ68Q~Yme-Af1vseAzTp6eSH4MCfYlhgkquIWart
VIPPS_SUBSCRIPTION_KEY=4440b081320bfdb544a301a8708d391c
VIPPS_MERCHANT_SERIAL_NUMBER=1028040
VIPPS_API_URL=https://apitest.vipps.no
VIPPS_REDIRECT_URI=http://localhost:3000/auth/vipps/callback
APP_REDIRECT_SCHEME=osloinside
JWT_SECRET=your-secret-key-here
```

---

## 9. Troubleshooting

### Error: "Invalid redirect URI"

**Cause:** Redirect URI not registered in Vipps portal

**Fix:** Add this URL in Vipps portal → Redirect URIs:
```
https://vipps-login-production.up.railway.app/auth/vipps/callback
```

---

### Error: "Invalid or expired state"

**Cause:** Session expired (10 min timeout) or state mismatch

**Fix:** Start login again with `/auth/vipps/login`

---

### Error: "Session not found or expired"

**Cause:** Session expired or invalid sessionId

**Fix:** The login session is only valid for 10 minutes. Start login again.

---

### Error: 502 Bad Gateway on Railway

**Cause:** App crashed or PORT issue

**Fix:** 
1. Check Railway logs for errors
2. Remove `PORT` from environment variables (Railway sets it automatically)

---

### Error: "undefined" in authUrl

**Cause:** Environment variables not set

**Fix:** Add all required variables in Railway → Variables tab

---

## 10. Security Notes

1. **Never expose `client_secret`** in frontend code or logs
2. **Store JWT tokens securely** in iOS Keychain
3. **Use HTTPS** in production (Railway provides this)
4. **Sessions expire** after 10 minutes for security
5. **JWT tokens expire** after 7 days (configurable)

---

## 11. iOS Code Example (Complete)

```swift
import Foundation

class VippsAuthManager {
    
    static let shared = VippsAuthManager()
    
    private let baseURL = "https://vipps-login-production.up.railway.app"
    private var currentSessionId: String?
    
    // Step 1: Start login
    func startLogin(completion: @escaping (URL?) -> Void) {
        guard let url = URL(string: "\(baseURL)/auth/vipps/login") else {
            completion(nil)
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let authUrlString = json["authUrl"] as? String,
                  let sessionId = json["sessionId"] as? String,
                  let authUrl = URL(string: authUrlString) else {
                completion(nil)
                return
            }
            
            self.currentSessionId = sessionId
            completion(authUrl)
        }.resume()
    }
    
    // Step 2: Handle callback (called from onOpenURL)
    func handleCallback(url: URL, completion: @escaping (User?) -> Void) {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let success = components?.queryItems?.first(where: { $0.name == "success" })?.value
        let sessionId = components?.queryItems?.first(where: { $0.name == "sessionId" })?.value
        
        guard success == "true", let sessionId = sessionId else {
            completion(nil)
            return
        }
        
        fetchSession(sessionId: sessionId, completion: completion)
    }
    
    // Step 3: Fetch session and get JWT
    private func fetchSession(sessionId: String, completion: @escaping (User?) -> Void) {
        guard let url = URL(string: "\(baseURL)/auth/vipps/session") else {
            completion(nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": sessionId])
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let token = json["token"] as? String,
                  let userDict = json["user"] as? [String: Any] else {
                completion(nil)
                return
            }
            
            // Save token to Keychain (implement your own Keychain helper)
            KeychainHelper.save(token, forKey: "auth_token")
            
            // Create user object
            let user = User(
                sub: userDict["sub"] as? String ?? "",
                name: userDict["name"] as? String,
                email: userDict["email"] as? String,
                phone: userDict["phone_number"] as? String
            )
            
            completion(user)
        }.resume()
    }
    
    // Logout
    func logout(completion: @escaping (Bool) -> Void) {
        guard let sessionId = currentSessionId,
              let url = URL(string: "\(baseURL)/auth/signout") else {
            completion(false)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": sessionId])
        
        URLSession.shared.dataTask(with: request) { _, _, _ in
            KeychainHelper.delete(forKey: "auth_token")
            self.currentSessionId = nil
            completion(true)
        }.resume()
    }
}

struct User {
    let sub: String
    let name: String?
    let email: String?
    let phone: String?
}
```

---

## 12. Checklist Before Going Live

- [ ] Vipps credentials added to Railway environment variables
- [ ] Redirect URI registered in Vipps portal
- [ ] iOS URL scheme `osloinside` registered in Xcode
- [ ] iOS app handles `onOpenURL` callback
- [ ] Tested full login flow end-to-end
- [ ] JWT token stored securely in Keychain
- [ ] Error handling implemented in iOS app