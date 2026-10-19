# Security model

## Summary
| Asset | Protection | Where enforced |
|---|---|---|
| Private Vault items | AES-256-GCM, key derived from the vault passphrase (PBKDF2-SHA-256, 310k iterations, random 16-byte salt). Key is non-extractable and kept only in memory while unlocked. Only ciphertext + IV are stored (IndexedDB and, if synced, Postgres). | Client (Web Crypto API) |
| App lock PIN/password | Stored as PBKDF2-SHA-256 hash (310k iterations, random salt); constant-time comparison; exponential back-off after 5 failures (30 s → 1 h). | Client |
| Cloud data | Supabase Auth (JWT) + Row Level Security on every table: `user_id = auth.uid()` for select/insert/update/delete; `user_id` immutable via trigger; forced RLS. | Postgres (server) |
| Uploaded files (cloud) | Private `media` bucket; object path must start with the caller's user id. | Supabase Storage policies (server) |
| AI API key | Stored as a Supabase function secret; the browser calls the `ai` edge function with the user's JWT. Per-user rate limit (10/min). | Edge function (server) |
| Audit trail | Local log of lock/unlock/vault/backup/sync events (no secrets). Server table `audit_events` is append-only for users. | Client / Postgres |

## Important limitations (read these)
- **The app lock is not encryption.** It hides the UI and clears vault keys, and the locked screen does not render app content into the DOM. But non-vault data in IndexedDB is readable by anyone with access to the unlocked OS account / browser profile and developer tools. Never rely on the PIN alone for sensitive cloud data — that is protected by authentication + RLS on the server.
- **Vault passphrases cannot be recovered.** There is no key escrow. Keep an exported backup *and* remember the passphrase.
- **Client-side rate limiting can be bypassed** by clearing site data (which also deletes the data being protected). Server-side auth rate limits are provided by Supabase Auth (`[auth.rate_limit]` in `supabase/config.toml`).
- The vault implementation uses standard Web Crypto primitives but **has not been independently audited**.
- 2FA (TOTP) relies on Supabase MFA. To *require* 2FA for data access, add `auth.jwt()->>'aal' = 'aal2'` to the RLS policies (not enabled by default so users without 2FA can still sync).

## Platform notes
| Platform | Storage | Notes |
|---|---|---|
| Web | IndexedDB (origin-scoped) | Browser may evict data under storage pressure unless persistent storage is granted (the app requests it). Clearing site data deletes everything local. |
| PWA | Same as web | Service worker caches app code only, never user data. |
| Desktop (Tauri) | WebView IndexedDB in the app data dir | Restrictive CSP in `tauri.conf.json`. Recommended next step: store a device key in the OS keychain (e.g. `tauri-plugin-stronghold` / keyring) to encrypt the whole local DB. |
| Mobile (Capacitor) | WebView IndexedDB | Biometric unlock should use a native plugin backed by Android BiometricPrompt / iOS LocalAuthentication, gating a key in Keystore/Keychain. Not yet wired up. |

## Secrets hygiene
- Only `VITE_SUPABASE_URL` and the **anon** key are bundled. The service-role key must never be put in any `VITE_` variable.
- Tokens and passwords are never logged; the audit log stores event types and short non-sensitive details only.
- CSV export neutralises formula injection (`=`, `+`, `-`, `@` prefixes).
- User-entered URLs are restricted to `http(s)`; links open with `rel="noopener noreferrer"`. Markdown import escapes HTML and only keeps http/https/mailto links. Uploaded SVGs are only displayed via `<img>` (scripts don't execute).
- The calculator uses a hand-written parser — no `eval`/`Function`.
