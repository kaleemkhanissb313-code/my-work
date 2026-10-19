# Platforms & packaging

The same `dist/` web build is used everywhere.

## Web / PWA
- `npm run build && npm run preview`. Deploy `dist/` to any static host; configure an SPA fallback (all routes → `index.html`).
- `vite-plugin-pwa` generates the manifest and a service worker that precaches the app shell. User data is never cached by the service worker.
- Install from the browser's “Install app” option. Works offline after first load.

## Desktop — Tauri 2 (Windows, macOS)
Status: configuration scaffolded in `src-tauri/`; **not built in this environment** (requires Rust toolchain).
```bash
npm i -D @tauri-apps/cli@^2
npx tauri icon public/icon.png      # generate icons (export icon.svg to a 1024px PNG first)
npx tauri dev                        # run
npx tauri build                      # .msi/.exe (Windows) or .dmg/.app (macOS)
```
Prerequisites: Rust (rustup), Windows: WebView2 + MSVC build tools; macOS: Xcode CLT. Code signing/notarization required for distribution.
Permissions: only `core:default`. CSP restricts network access to self + Supabase.

## Mobile — Capacitor (Android, iOS)
Status: `capacitor.config.json` scaffolded; **native projects not generated here** (require Android Studio / Xcode).
```bash
npm i @capacitor/core && npm i -D @capacitor/cli
npm i @capacitor/android @capacitor/ios
npm run build
npx cap add android && npx cap add ios
npx cap sync
npx cap open android   # or ios
```
Recommended native plugins (not yet installed): local notifications (true background reminders), a biometric plugin (BiometricPrompt / Face ID) to enable biometric unlock, and secure storage (Keystore/Keychain) for a device key.

| Capability | Web/PWA | Desktop (Tauri) | Mobile (Capacitor) |
|---|---|---|---|
| Offline data | ✅ IndexedDB | ✅ | ✅ |
| Reminders while app open | ✅ | ✅ | ✅ |
| Background reminders | ❌ | ➕ needs notification plugin | ➕ needs local-notifications plugin |
| Biometric unlock | ❌ | ➕ Windows Hello/Touch ID via plugin | ➕ biometric plugin |
| File upload | ✅ | ✅ | ✅ (camera/gallery via file input) |
