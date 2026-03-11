# SAML 2.0 SSO

Boardupscale supports SAML 2.0 for enterprise single sign-on. Users log in through your existing identity provider (IdP) — Okta, Azure AD, Google Workspace, OneLogin, etc.

---

## How It Works

```
User → Boardupscale Login → Redirect to IdP → User authenticates → IdP posts SAML assertion → Boardupscale → Logged in
```

Boardupscale acts as the **Service Provider (SP)**. Your corporate IdP handles the authentication.

---

## Setup

### Step 1 — Get Your SP Metadata

Your SP metadata URL is:

```
https://your-domain/api/auth/saml/metadata?orgSlug=your-org-slug
```

Download this XML — you'll need it when configuring your IdP.

The key values:
- **Entity ID (Issuer):** `https://your-domain/api/auth/saml`
- **ACS URL:** `https://your-domain/api/auth/saml/callback`

### Step 2 — Configure Your IdP

#### Okta
1. Create a new **SAML 2.0 Application** in Okta
2. Set **Single sign on URL (ACS):** `https://your-domain/api/auth/saml/callback`
3. Set **Audience URI (SP Entity ID):** `https://your-domain/api/auth/saml`
4. Attribute statements:
   - `email` → `user.email`
   - `firstName` → `user.firstName`
   - `lastName` → `user.lastName`
5. Download the **IdP metadata XML** or copy the SSO URL and certificate

#### Azure Active Directory
1. Create an **Enterprise Application** in Azure AD → **Non-gallery application**
2. Set up **Single Sign-On → SAML**
3. Set **Identifier (Entity ID):** `https://your-domain/api/auth/saml`
4. Set **Reply URL (ACS):** `https://your-domain/api/auth/saml/callback`
5. Map claims: `emailaddress`, `givenname`, `surname`
6. Download **Certificate (Base64)** and note the **Login URL**

#### Google Workspace
1. Go to Admin Console → Apps → **Web and Mobile Apps** → Add SAML App
2. Set **ACS URL:** `https://your-domain/api/auth/saml/callback`
3. Set **Entity ID:** `https://your-domain/api/auth/saml`
4. Attribute mapping: `Primary Email` → `email`
5. Download the IdP metadata

### Step 3 — Configure Boardupscale

Add to your `.env`:

```env
SAML_ENTRY_POINT=https://your-idp-sso-url
SAML_ISSUER=https://your-domain/api/auth/saml
SAML_CERT=BASE64_ENCODED_IDP_CERTIFICATE
SAML_CALLBACK_URL=https://your-domain/api/auth/saml/callback
```

The certificate must be the IdP's signing certificate, base64-encoded (the raw PEM without headers and newlines).

```bash
# Convert PEM to base64
cat idp-cert.pem | grep -v "BEGIN\|END" | tr -d '\n'
```

Restart the API container after changing these values.

---

## Logging In with SAML

Users log in at:

```
https://your-domain/login?orgSlug=your-org-slug
```

Or use the **SSO Login** button on the login page and enter the organisation slug.

---

## User Provisioning

When a user logs in via SAML for the first time:
- If a Boardupscale account exists with that email → they are logged in
- If no account exists → one is created automatically and the user is added to the organisation as a **Member**

Existing passwords are not affected — users can still log in with email/password unless you disable it.

---

## Checking SAML Status

```
GET /api/auth/saml/status?orgSlug=your-org-slug
```

Returns `{ "configured": true }` if SAML is configured for the org.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid SAML response` | Certificate mismatch | Re-export and re-paste the IdP certificate |
| `Audience restriction check failed` | Entity ID mismatch | Ensure IdP and `.env` entity IDs match exactly |
| `User attribute 'email' missing` | IdP not sending email | Add email attribute mapping in your IdP config |
| Redirect loop | Wrong ACS URL | ACS URL must match exactly — no trailing slash |
