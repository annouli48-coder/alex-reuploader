# ALEX Decompiler Connect v0.2.0

**A new site for desktop and mobile, with real Roblox OAuth login and server-only scripts for two specific Roblox accounts.** It is an authorized local Roblox XML place analyzer; it does *not* inject into Roblox Player or execute arbitrary Lua.

## What works

- **Real Roblox sign-in:** OAuth 2.0 Authorization Code + PKCE, state/cookie validation, server-side token exchange, `/userinfo` subject `sub` user ID, 12-hour HttpOnly login cookie. Usernames alone never grant owner access.
- **Two owner IDs:** `10290256654` and `9140908042` (change with `ALEX_OWNER_ROBLOX_IDS`). Only these verified accounts may fetch, add, copy, or remove scripts in the private owner vault. Server stores the source outside the public web directory. All other accounts receive HTTP `403`; visitors receive `401`.
- **Everyone else:** Roblox login required to use the fixed local file analyzer. No arbitrary Lua entry box. Choose your *own* Roblox Studio `.rbxlx` or `.rbxmx`, confirm permission, Execute Decompiler, export extracted saved Lua sources plus a report.
- **Privacy:** Place files are analyzed locally in the browser via a Web Worker; the file does not upload. The owner vault *does* send private Lua to the server for storage; it must use HTTPS and private/persistent storage.
- **Mobile/tablet:** responsive site and installable PWA. iPhone/iPad: Safari → Share → Add to Home Screen. Android: Chrome → Install App/Add to Home Screen. Roblox login needs a live internet connection.
- **Mac/Windows:** included local installer scripts create a Mac `.app` launcher and Windows Start Menu/Desktop shortcuts to the *hosted site*. They don't download native injectors or install an Electron binary.

### Important owner code behavior

The previously uploaded `ALEX_DECOMPILER_ORIGINAL_V4_OPEN_HERE` file is **not embedded in the distributable/public website** because anyone who downloads a public bundle could copy it. An authorized owner can sign in and paste it into **Private Owner Vault**, title it `ALEX V4`, and save it. Then both authorized Roblox IDs can view/copy it, and everyone else cannot fetch it via the web APIs. Scripts saved in the vault are stored but never executed.

**No desktop or web app can guarantee code stays secret if it sends the code to every user for execution.** Only owner code that stays server-side can be protected from ordinary unauthorized users. The publicly shipped XML analyzer code is open to inspection.

## Start locally

Use Node.js 22 or later:

```sh
cd ALEX-Decompiler-Connect
npm test
npm start
```

Open `http://localhost:3000` — it shows **login not configured** until you register a Roblox OAuth application. The OAuth redirect URL should be exactly `http://localhost:3000/auth/callback` if your Roblox OAuth app permits it; otherwise deploy to HTTPS first.

## Host website (required for live mobile sign-in)

1. Create a Roblox OAuth application at the [Creator Dashboard credentials page](https://create.roblox.com/dashboard/credentials), using `openid profile` scopes. Roblox's official documentation says users must have **13+ Roblox accounts to authorize OAuth apps**, and app developers must meet Roblox's ID-verification requirement to register an OAuth app.
2. Deploy this project as a **new service** on Railway or another Node.js HTTPS host. For a GitHub repository containing multiple apps, set **Root Directory** to `ALEX-Decompiler-Connect`. Use Node.js 22+, start with `npm start`, and use one replica.
3. Give it a real HTTPS hostname, e.g. `https://YOUR-DEPLOYED-SITE.example`. In the Roblox app add the redirect URI `https://YOUR-DEPLOYED-SITE.example/auth/callback`.
4. Configure variables on the *private hosting service* (not committed to GitHub):

   - `PUBLIC_BASE_URL=https://YOUR-DEPLOYED-SITE.example`
   - `ROBLOX_OAUTH_CLIENT_ID=...`
   - `ROBLOX_OAUTH_CLIENT_SECRET=...`
   - `ALEX_OWNER_ROBLOX_IDS=10290256654,9140908042`
   - `ALEX_DATA_DIR=/data`

5. Attach a **persistent volume at `/data`**; otherwise owner library entries disappear on redeploy. Do not expose this directory, allow debug static serving, or copy it to public GitHub. Make production site HTTPS; use one instance because session state is in memory.
6. Visit `https://YOUR-DEPLOYED-SITE.example/health`, then connect a qualifying Roblox account. The app only asks for Roblox identity (`openid profile`), not account cookies/passwords or asset-write scopes.

> Roblox's OAuth authorization restriction for accounts under age 13 cannot be bypassed by this project. App passwords, client secrets, and access tokens should never be posted into a chat or public repository.

## Desktop launcher install commands (after live site deployment)

Download the project ZIP and extract it; use the scripts in `install/`. On **Mac Terminal**:

```bash
bash ./install/install-macos.sh https://YOUR-DEPLOYED-SITE.example
```

This creates `~/Applications/ALEX Decompiler Connect.app` with its own icon and opens the actual hosted site in your browser. On **Windows PowerShell**:

```powershell
.\install\install-windows.ps1 -SiteUrl 'https://YOUR-DEPLOYED-SITE.example'
```

The Windows launcher creates a shortcut on the Desktop and Start Menu. No terminal script can make an unhosted OAuth website functional; the server and Roblox credentials have to be set up first.

## Security and functional limits

- Owner IDs are checked from Roblox's OAuth `/userinfo` response; a text field claiming to be an ID does not grant access.
- Login cookie is HttpOnly and Secure in HTTPS production, `SameSite=Lax`. Mutating endpoints require an anti-CSRF value and same-site Origin.
- Server stores owner code outside `/public`; `/api/owner/scripts` returns full source only to authenticated owners. Do not publish raw vault data.
- Data store uses one local JSON file with atomic rename and a serialized write queue. Deploy one replica with persistent volume; use encrypted disks/backups and protect your host account.
- Login sessions are in memory and expire in 12 hours; restarting the service signs users out. OAuth tokens are used only during sign-in and are not retained.
- The XML engine reads source **already saved** in a file. It does not recover missing server-side scripts, reverse compiled bytecode, or access unrelated live Roblox experiences. `.rbxl` binary files are not accepted; save `.rbxlx` via Studio.
- App limits XML file size to 120 MB and private source entries to 1.5 MB; large mobile files may run out of device memory.
- PWA offline cache stores **only public files**. Private API responses are never cached. An active online session is required to authenticate.
- No network credentials or your private V4 Luau source are included in this distribution.

## Test

```sh
npm test
npm run check
```

The included integration test uses a **mocked Roblox OAuth identity response** to verify that both owner IDs may read the private vault, ordinary users get `403`, signed-out users get `401`, and unauthorized script POSTs are rejected. This is not a live Roblox sign-in test; actual OAuth registration and hosted sign-in must still be verified in a real browser.

Official Roblox documentation: [OAuth 2.0 reference](https://create.roblox.com/docs/cloud/auth/oauth2-reference), [OAuth overview](https://create.roblox.com/docs/cloud/auth/oauth2-overview), [place files](https://create.roblox.com/docs/projects/place-files).
