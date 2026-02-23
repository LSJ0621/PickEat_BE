# CSRF Protection Strategy

## Current Implementation (Phase 1)

### Authentication Method
PickEat uses **JWT (JSON Web Token)** based authentication with tokens stored in:
- **Access Token**: `localStorage` (15-minute expiry)
- **Refresh Token**: `localStorage` (7-day expiry)

### CSRF Risk Assessment
**Risk Level: Low**

The application is **NOT vulnerable to traditional CSRF attacks** because:

1. **No Cookie-Based Authentication**
   - Tokens are stored in `localStorage`, not cookies
   - Browsers do NOT automatically attach `localStorage` data to requests
   - CSRF attacks rely on automatic cookie transmission

2. **Manual Token Attachment**
   - Frontend explicitly adds `Authorization: Bearer <token>` header to each request
   - Malicious sites cannot access `localStorage` due to Same-Origin Policy
   - Cross-origin requests cannot read or attach victim's tokens

3. **CORS Configuration**
   - Backend only accepts requests from whitelisted origins
   - Prevents unauthorized cross-origin requests

### Security Considerations

**Advantages of Current Approach:**
- ✅ Immune to CSRF (no automatic credential transmission)
- ✅ Simple implementation (no CSRF token management)
- ✅ Stateless authentication (no server-side session)

**Disadvantages:**
- ⚠️ Vulnerable to XSS (malicious scripts can read `localStorage`)
- ⚠️ Tokens persist across browser tabs (cannot invalidate without backend call)

### XSS Mitigation Measures
Since the main risk is XSS rather than CSRF:

1. **Content Security Policy (CSP)** headers restrict script sources
2. **Input validation** on all user-provided data
3. **Output encoding** to prevent script injection
4. **Dependency scanning** for vulnerable packages
5. **Regular security audits**

---

## Future Enhancements (Phase 2)

If migrating to **cookie-based authentication** in the future, implement:

### 1. SameSite Cookie Attribute
```typescript
res.cookie('refreshToken', token, {
  httpOnly: true,        // Prevents JavaScript access
  secure: true,          // HTTPS only
  sameSite: 'strict',    // Blocks cross-site requests
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

**SameSite Options:**
- `strict`: Most secure, blocks all cross-site requests (may break legitimate flows)
- `lax`: Allows top-level navigation (GET requests from links)
- `none`: Requires `secure: true`, allows all cross-site requests

### 2. CSRF Token Pattern
If `SameSite` is insufficient (e.g., supporting older browsers):

```typescript
// Backend: Generate CSRF token
const csrfToken = crypto.randomBytes(32).toString('hex');
res.cookie('XSRF-TOKEN', csrfToken, { httpOnly: false }); // Readable by JS
req.session.csrfToken = csrfToken;

// Frontend: Include token in header
headers: {
  'X-XSRF-TOKEN': getCookie('XSRF-TOKEN')
}

// Backend: Validate token
if (req.headers['x-xsrf-token'] !== req.session.csrfToken) {
  throw new ForbiddenException('Invalid CSRF token');
}
```

### 3. Double Submit Cookie Pattern
Alternative to server-side CSRF token storage:

1. Backend sets CSRF token in cookie (non-HttpOnly, readable by JS)
2. Frontend reads cookie and sends same token in custom header
3. Backend validates cookie value matches header value
4. Malicious sites cannot read victim's cookies (Same-Origin Policy)

### 4. Referer/Origin Header Validation
Additional layer of defense:

```typescript
const allowedOrigins = ['https://pickeat.com'];
const origin = req.headers.origin || req.headers.referer;

if (!allowedOrigins.includes(origin)) {
  throw new ForbiddenException('Invalid origin');
}
```

---

## Recommended Reading
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN: SameSite Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [JWT vs Cookies: Security Analysis](https://auth0.com/blog/token-based-authentication-made-easy/)

---

## Version History
- **2024-02-13**: Initial documentation (Phase 1 - JWT in localStorage)
