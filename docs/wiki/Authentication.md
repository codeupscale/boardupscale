# Authentication

Boardupscale supports multiple authentication methods. All methods issue the same JWT access + refresh token pair on success.

---

## Email & Password

The default login method. Users register with an email address and password.

- Passwords are hashed with **bcrypt** (cost factor 12)
- Email verification is required before logging in
- Accounts are locked after repeated failed attempts (rate-limited)

---

## Email Verification

After registration, a verification email is sent. The link expires after 24 hours.

To resend: go to your profile and click **Resend verification email**.

---

## Password Reset

1. Click **Forgot Password** on the login page
2. Enter your email address
3. Check your email for a reset link (expires in 1 hour)
4. Set a new password

---

## Google OAuth

Log in with your Google account. No password needed.

**Setup (admin):**
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the Google+ API
3. Create OAuth credentials (Web application type)
4. Set Authorised redirect URI: `https://your-domain/api/auth/google/callback`
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your `.env`

---

## GitHub OAuth

Log in with your GitHub account.

**Setup (admin):**
1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**
2. Set Homepage URL: `https://your-domain`
3. Set Authorization callback URL: `https://your-domain/api/auth/github/callback`
4. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to your `.env`

---

## Two-Factor Authentication (2FA)

2FA adds a second layer of security using a time-based one-time password (TOTP) app like Google Authenticator, Authy, or 1Password.

### Enabling 2FA

1. Go to **User Settings → Security**
2. Click **Enable Two-Factor Authentication**
3. Scan the QR code with your authenticator app
4. Enter the 6-digit code to confirm
5. **Save your backup codes** — these are shown once and can be used if you lose your phone

### Logging in with 2FA

1. Enter your email and password as normal
2. When prompted, open your authenticator app
3. Enter the current 6-digit code

### Backup Codes

Each account gets 10 single-use backup codes. Use one if you've lost access to your authenticator app.

To regenerate backup codes: **User Settings → Security → Regenerate Backup Codes** (requires your current password).

### Disabling 2FA

**User Settings → Security → Disable 2FA** (requires your current password).

---

## SAML 2.0 SSO

Enterprise identity provider integration. See [SAML SSO](SAML-SSO) for full setup instructions.

---

## JWT Tokens

| Token | Expiry | Storage |
|-------|--------|---------|
| Access token | 15 minutes | Memory (not localStorage) |
| Refresh token | 7 days | HttpOnly cookie |

Access tokens are automatically refreshed before expiry. If the refresh token expires, the user is logged out.

**Refresh token rotation:** Every refresh issues a new refresh token. The old one is immediately invalidated, preventing reuse.

---

## Sessions & Logout

- **Logout:** Revokes the current refresh token immediately
- **Logout all devices:** Not yet implemented — coming soon
- Tokens are stored in the database; you can revoke all tokens by resetting `JWT_SECRET` (logs everyone out)
