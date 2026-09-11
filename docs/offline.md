# Installation and offline behavior

Folia's manifest and icons support installation from browsers that offer it. Serve the production app over HTTPS (localhost is allowed for development). Open the application online once and let the service worker finish caching. Installation prompts vary by browser; on iOS use Safari's Add to Home Screen action. Browser support and install controls are platform-dependent.

`public/sw.js` caches only the credentialless public application shell, immutable Next.js assets, and installation icons. It never caches authentication, API, billing, or account routes, checkout returns, access tokens, or authenticated navigation responses. A successful first production visit prepares the public shell for subsequent offline launches. Do not change the root document to render private account content on the server without revisiting this cache boundary.

Successful online navigations also refresh the cached shell through a separate request that omits credentials. The worker stages every newly referenced hashed asset before replacing the offline HTML. Failed downloads or cache writes retain the previous usable shell; simultaneous refreshes share one operation. This keeps offline launches current after application deployments even when the worker script itself has not changed.

The application persistence layer owns timer recovery and permitted account/workspace data, with separate keys per scope. The service worker does not elevate access or act as the source of paid entitlements. Local timer operation, locally available content, and supported queued productivity edits can continue without the network. Invitations, memberships, account actions, billing, and other privileged operations require a connection. Reconnection must revalidate server permissions and entitlements and expose any rejected or conflicting queued change.

On sign-out the application checks the account's cached workspace queues and saving, offline, failed, or conflicting sync state. If work might be unsynced, it offers export and keeping the session open, and requires an explicit **Discard unsynced changes and sign out** action before clearing it. Export each affected workspace before choosing to discard. Successful sign-out clears the signed-in scope and its sensitive queue/cache records, then posts `{ type: 'CLEAR_PRIVATE_CACHES' }` to the service worker. The service worker clears any `folia-private-*` Cache Storage names; public executable assets stay cached. Account/workspace data belongs to the persistence layer, which performs its own scoped clearing. Service worker updates remove only old `folia-shell-*` asset caches and never delete productivity records or pending operations. Installing a new worker waits for the normal browser lifecycle unless the application explicitly requests an update using `SKIP_WAITING`.

The timer derives progress from persisted timestamps. Browsers can suspend background tabs, close service workers, throttle JavaScript, or suppress sounds and notifications while the device is locked. Neither a PWA nor a service worker guarantees a precise background/locked-screen alarm. On returning, Folia reconciles the current phase; it must not manufacture a chain of completed work sessions. Notification permission should only be requested after the user's explicit action, with an in-app fallback.

The cloud application requires a Next.js server and Supabase. Offline support does not make server-backed accounts or billing deployable on static-only hosting.

Verification should include a production build: open online, wait for the worker to control the page, reload offline, resume the timer, reconnect, and inspect queued conflict states. Confirm API/auth/billing requests are absent from Cache Storage, sign out and verify scoped private data is removed, then sign into a different account. The visual/browser suite and local timer tests do not substitute for authenticated cross-device sync checks against a configured backend.

The production offline browser suite is opt-in because development intentionally does not register a worker. Run `npm run build` then `npm start` in a separate terminal. In PowerShell:

```powershell
$env:PLAYWRIGHT_PWA='1'
$env:PLAYWRIGHT_CHANNEL='msedge' # Or omit when Playwright Chromium is installed.
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
npm run test:browser -- e2e/offline.spec.ts --workers=1 --output=.local/pwa-results
```

The suite verifies offline shell launch, UI task editing, paused/running timer recovery, no fabricated completions, privileged endpoint cache exclusions, and selective private cache clearing. Its dormant account queue is explicitly a seeded storage fixture to check preservation through shell reloads; this is not evidence of authenticated cloud replay. The two production Edge tests were executed successfully in the development environment; no external account or payment success is implied.
