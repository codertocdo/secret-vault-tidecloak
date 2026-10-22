[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

# Secret Vault

## Project overview

**Secret Vault keeps your personal notes, recovery codes and other sensitive information encrypted under keys that no single party holds. It opens them only while your session carries the right permission.**

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

> **Status at submission:** the Tide network could not provision a free-tier licence during the hackathon. Setup failed at step 1/14 with `Midgard.FinalizeWallet` returning 503 and then 500, across four attempts with two different contact emails. The app therefore ships with a clearly labelled **demo mode** that simulates the TideCloak surface locally. The real TideCloak integration is already in the code and switches on automatically when a `tidecloak.json` adapter config is present. See [How the two modes work](#how-the-two-modes-work).

### 1. Vision & originality

Password managers protect passwords. The things that actually unlock a person's life get far less protection:

- 2FA backup codes
- seed phrases
- account recovery keys
- private notes

Those usually end up in screenshots, notes apps or a cloud document. Each of these is protected by whoever runs the server.

Secret Vault treats **permission as part of the encryption itself**. Every secret is encrypted in the browser and tagged with a category, such as `notes` or `recovery`. A secret can be decrypted only when the user's current session holds that category's decrypt role. Revoking one role locks one category instantly, everywhere, while everything else stays readable. Access becomes something you can grant and revoke per category, not just a password you either have or don't.

### 2. Trust constraint insight

Today, "encrypted at rest" usually means the provider holds the key. That leaves three ways for the data to leak:

- a database breach together with a key-server breach,
- an insider with admin access, or
- a legal request to the provider.

That is why people keep recovery codes out of digital tools altogether, on paper or in a drawer, where they are easy to lose.

With TideCloak, encryption and decryption are authorised by the **Tide network**. The key material is split across independent nodes, so neither the app operator nor any single server ever holds it. Authorisation is bound to the user's session roles. Once that constraint is removed, it becomes safe to keep the most dangerous secrets in an online, synced, revocable vault. Even the people who run the vault cannot open it.

### 3. Value & impact

- **Individuals** can keep recovery codes and private notes online without trusting a single company with the key.
- **Families and small teams** can, for example, give a partner decrypt access to the `recovery` category for emergencies, then revoke it later without re-encrypting anything.
- **Organisations** can hold break-glass credentials that remain unreadable to their own administrators until a policy grants access.

**Concrete example.** An attacker dumps the database of the service where Minh keeps the recovery codes for his bank and email. With a normal notes app the attacker, or a curious administrator, can now read everything. With Secret Vault the dump contains only ciphertext. The server never had a key, and decryption requires Minh's own TideCloak session holding the `recovery` decrypt role. The codes stay sealed.

### 4. Why TideCloak matters

| Need | How Secret Vault uses TideCloak |
|---|---|
| Sign-in | `TideCloakContextProvider` + `useTideCloak()` (`login`, `logout`, `getValueFromToken`). |
| Encrypt before storing | `doEncrypt([{ data, tags: [category] }])` encrypts the title and body together, so even item names never leave the browser in plaintext. |
| Decrypt only with permission | `doDecrypt([{ encrypted, tags: [category] }])` succeeds only if the session holds the realm role `_tide_<category>.selfdecrypt`. |
| Per-category control | Three categories, each with its own tag and two realm roles. That gives six roles: `_tide_notes.selfencrypt` / `.selfdecrypt`, `_tide_recovery.selfencrypt` / `.selfdecrypt`, and `_tide_sensitive.selfencrypt` / `.selfdecrypt`. |
| Server trusts nothing it cannot verify | The API verifies the TideCloak access token against the realm JWKS, checks that it was issued to this app (`azp`), and refuses to file a record under a category whose `selfencrypt` role the token lacks. |
| No single key holder | Keys are managed by the Tide network rather than by our app or our storage layer. |

Without TideCloak this design would collapse into "the server keeps the key". In that world, role checks are only UI and can be bypassed by anyone with database and key access.

### 5. Prototype & storytelling

**What the prototype shows today (demo mode):**

1. **Encrypt & save.** A note or a set of recovery codes is encrypted in the browser before it is stored.
2. **What storage sees.** One click shows the raw records held by the API server: opaque ciphertext, with no titles and no plaintext.
3. **Unlock with auto-lock.** Secrets are sealed by default. Unlock decrypts on demand. An item re-locks after 30 seconds or as soon as you switch tabs. Copied secrets are wiped from the clipboard after 30 seconds.
4. **The key interaction: revoke one permission.** In the simulated admin console, revoke *Recovery codes → Can decrypt*. Recovery codes now refuse to decrypt, at the crypto layer and not only in the UI, while personal notes still open. Grant the role again and they open.

## How the two modes work

`src/auth.jsx` exposes a single hook, `useVaultAuth()`, with the same surface as `useTideCloak()`. At startup the app looks for `public/tidecloak.json`:

| Mode | When | Login & roles | Encryption | API authentication |
|---|---|---|---|---|
| **TideCloak** | `public/tidecloak.json` exists | Real TideCloak realm roles | Real `doEncrypt` / `doDecrypt` via the Tide network | Access token sent with `secureFetch`. The server verifies the signature against the realm JWKS, plus issuer and expiry. |
| **Demo** (labelled in the UI) | No adapter config | A single local demo user. Roles are toggled in a simulated admin console. | Local AES-GCM (WebCrypto). The category tag is bound as associated data, and every call checks the matching `_tide_<tag>.self*` role. | Fixed demo header. |

The browser and the API server pick the mode the same way, by checking whether `public/tidecloak.json` exists.

### Architecture

```
Browser (React)                                   API server (Express)
  plaintext ──doEncrypt──► ciphertext ──POST /api/items──► validates shape, assigns id/owner
                                                             └─► server/data/vault.json (ciphertext only)
  plaintext ◄──doDecrypt── ciphertext ◄──GET /api/items───  returns the caller's records only
     ▲
     └── succeeds only if the session holds _tide_<category>.selfdecrypt
```

The server never receives plaintext and never holds a key, so it **cannot** decrypt anything it stores.

Demo mode exists only so the product can be demonstrated while the Tide network is unavailable. **It is not secure.** Its key is derived locally, which is exactly the trust problem TideCloak removes.

## Setup

**Requirements:** Node.js 18+ and npm. For TideCloak mode you also need Docker Desktop.

### Quick start (demo mode)

```bash
npm install
npm run dev     # starts the API (port 3001) and the web app (port 5173)
npm test        # backend tests, including "plaintext never reaches disk"
```

Open http://localhost:5173 and click **Log in (demo)**.

### TideCloak mode

1. Start TideCloak:
   ```bash
   docker run -d --name tidecloak -p 8080:8080 \
     -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=password \
     tideorg/tidecloak-dev:latest
   ```
2. Open http://localhost:8080, sign in as `admin` / `password`, and run the setup wizard:
   - Realm: `secretvault`
   - App (client ID): `secret-vault`
   - Redirect URI: `http://localhost:5173/*`
   - Web origin: `http://localhost:5173`
3. Create the six realm roles listed above. Assign them to your user, then approve the change request.
4. Download `tidecloak.json` from the app and save it as `public/tidecloak.json`. This file is git-ignored.
5. Run `npm install && npm run dev`, open http://localhost:5173, and click **Log in with TideCloak**.

## Project structure

```
src/
  main.jsx       Detects the mode and mounts the app
  auth.jsx       useVaultAuth(): TideCloak bridge or demo provider, plus an authenticated apiFetch
  vault.js       Categories/tags, role names, encrypt/decrypt helpers, API client
  App.jsx        UI: tabs, permission badges, items, auto-lock, storage inspector, demo role panel
  style.css
server/
  index.js       Entry point: picks tide/demo auth and listens on :3001
  app.js         Routes: GET/POST /api/items, DELETE /api/items/:id, GET /api/health
  auth.js        TideCloak JWT verification (jose + realm JWKS) or demo header
  store.js       Ciphertext-only JSON file store (atomic write-then-rename)
  app.test.js    node:test suite
```

## Security notes and limitations

- Only ciphertext reaches the server. Titles are encrypted together with bodies.
- The API stores only whitelisted fields: category and ciphertext. It assigns owner, id and timestamp itself, and every read or delete is scoped to the caller's own records.
- In TideCloak mode, role changes take effect after the next sign-in, because roles are carried in the token.
- If the TideCloak client enforces DPoP, the server checks the token but **does not yet verify the DPoP proof**.
- Demo-mode API authentication is a fixed header. It exists for local demonstration only.
- The TideCloak integration was written against `@tidecloak/react` 0.14.33. Because of the licence-provisioning outage it **has not yet been verified end-to-end** against a live Tide-enabled realm.

## Video

See [`Video.mp4`](Video.mp4) for a walkthrough of the prototype.
