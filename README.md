# ALEX Reuploader

Creator-authorized Roblox asset reupload workspace with a native `.rbxl` place-file scanner, a Studio ID-mapping plugin, and a Railway-ready website.

## What works

- The website file picker accepts **only `.rbxl`** Roblox place files (binary format). It reads the file locally in the browser, finds `Sound`, `Animation`, and common `AudioPlayer` asset references, and displays location counts and asset-ID lists. The place file is never uploaded to ALEX.
- The `.rbxl` parser handles standard compressed (LZ4) and uncompressed chunks. It recognizes clear `SoundId`/`AnimationId` references embedded in scripts and appropriately named value objects where those strings are serialized in the file.
- The optional Studio plugin can scan an open project separately, select an existing animation from Roblox's own picker, and apply a copied `old_id=new_id` map with Undo support. It is no longer required for uploading scan data to the website.
- Sign in with Roblox using **OAuth 2.0 authorization code + PKCE**; app secrets stay on the server.
- Upload a **file you own or may redistribute** via Roblox's Open Cloud Assets API. Optional group target is checked by Roblox; entering a group ID does not grant upload permission.
- Poll Roblox's asset operation to obtain a new asset ID; export `old_id=new_id` mapping to the Studio plugin for editing, with Studio Undo support.
- Verify the configured Roblox gamepasses server-side. Owner accounts `9140908042` and `10290256654` receive Ultra; other users receive their highest verified pass. Ultra adds custom asset descriptions.
- Browser keeps the scan and successful mappings locally (no source media stored by the app). Media is sent to Roblox on upload.

## Run locally

Use Node.js 20 or later. No npm dependencies are required.

```sh
cd alex-reuploader
npm test
npm start
```

Open `http://localhost:3000`. You can scan an `.rbxl` without OAuth credentials. Actual sign-in and upload need configuration below.

## Deploy the website to Railway

1. Add the contents of this `alex-reuploader` folder to a GitHub repository, then select that repository in [Railway](https://railway.com/).
2. In Railway, set the **Root Directory** to `/alex-reuploader` if the repository contains that subfolder. If the repository root itself has `package.json`, leave Root Directory empty.
3. Set the start command to `npm start` (or allow Railway to detect it).
4. Generate a Railway domain, e.g. `https://your-service.up.railway.app`.
5. Go to [Roblox Creator Dashboard — Credentials](https://create.roblox.com/dashboard/credentials), register/configure an OAuth app, and allow `openid`, `profile`, `asset:read`, `asset:write` scopes. Add redirect URL **`https://your-service.up.railway.app/auth/callback`**.
6. Add these Railway **Variables** and redeploy:

| Variable | Value |
| --- | --- |
| `ROBLOX_OAUTH_CLIENT_ID` | Your OAuth application client ID |
| `ROBLOX_OAUTH_CLIENT_SECRET` | Your private OAuth client secret |
| `PUBLIC_BASE_URL` | The exact `https://…` Railway domain, without trailing slash |
| `PORT` | Not necessary; Railway injects it automatically |

**Do not publish an OAuth secret, Roblox `.ROBLOSECURITY` cookie, or API key in the plugin, HTML, or GitHub.** This app uploads through the individual user's scoped OAuth session; it does **not** require `ROBLOX_ASSET_API_KEY` or any Roblox cookie.

### Scan your .RBXL file

1. Open your own experience in Roblox Studio.
2. Use **File → Save to File** and save the place in binary `.rbxl` format.
3. Open the ALEX website → **Asset scanner** → **Choose .RBXL file**. No plugin or JSON export is needed.
4. Review the detected sounds, animations, and expandable service/folder hierarchy. The scanner reads asset references, **not** the original downloadable sound/animation bytes.
5. Sign in with Roblox to upload permitted original media files. Each successful upload creates a new Roblox asset ID, which is mapped to the original reference.

The site file picker intentionally **does not** accept `.rbxlx`, `.rbxmx`, `.rbxm`, `.json` or `.csv`. Binary RBXL parsing is best-effort: unknown future property types or encrypted/non-standard serialization may not be recognized. The browser file-size limit is 150 MB.

### Optional: Apply new IDs using the Studio plugin

The included `studio/ALEX_REUPLOADER_PLUGIN.rbxmx` is a **Studio plugin**, not an executor script.

1. Import the plugin into Roblox Studio as a local plugin.
2. Open the toolbar's **ALEX Reuploader** panel.
3. After completing authorized uploads on the website, copy the resulting `old_id=new_id` map from **Reupload queue**.
4. Paste that map into the plugin's second text box, then click **APPLY ID MAP TO STUDIO**. Use Ctrl+Z in Studio to undo if needed.

The plugin also includes advanced read-only project scanning tools. You can ignore them when using the website's `.rbxl` scanner.

## Gamepasses & usage

| Tier | Pass | App allowance |
| --- | --- | --- |
| Free | — | 5 accepted uploads/day |
| Creator | `2037861333` | 20/day |
| Pro | `2037927296` | 50/day |
| Ultra | `2040560797` | 100/day + custom description |

Pass ownership is verified using Roblox's public inventory ownership endpoint. If Roblox does not confirm a pass (for example when an account's inventory is private), the app **fails closed** at Free. Roblox's own platform upload quotas, content moderation, and group permissions still apply. The app-side usage counter is currently in memory; add a persistent database and payment-support policy before selling these plans publicly across multiple Railway instances. Do **not** advertise the numeric daily allowances as guaranteed Roblox uploads.

## Security & limitations

- The app never downloads locked audio, animations, or assets from other creators to evade permission controls. It can't reconstruct original media from numeric asset IDs alone.
- RBXL binary decoding is based on the [RobloxAPI binary format specification](https://github.com/RobloxAPI/spec/blob/master/formats/rbxl.md), with size limits and malformed-file checks. It does not execute script content from the file.
- `Mesh` asset content is not generally uploadable from an arbitrary `.fbx` as type Mesh using the standard Assets API; use Studio Importer, then apply new references manually.
- Audio must meet Roblox's duration and upload quota limits; maximum media file size here is 20 MB.
- A successful API request may return a processing operation. Wait for the new asset ID, then paste the map. Do not retry immediately if polling times out; verify on Creator Dashboard to avoid duplicates.
- Signed-in sessions, rate counts, and OAuth state live in one process's memory. Deploy as **one Railway replica** for this version. Restarting the service logs users out and resets app counters. Before a full public launch, replace these with persistent server-side storage, and add account-specific throttles and abuse controls.
- The plugin scans property-based `rbxassetid://...` or URL IDs it can access in the open Studio project. It doesn't read `ServerStorage`/`ServerScriptService` from other people's running games, doesn't enumerate Roblox's private Asset Manager database, and doesn't parse arbitrary IDs from scripts. The **scan and animation picker are read-only**; only **APPLY ID MAP** edits your open project.
- Upload descriptions are intentionally disabled unless Ultra entitlement is server-verified.

## Official documentation

- [Roblox Open Cloud Asset API usage guide](https://create.roblox.com/docs/cloud/guides/usage-assets)
- [Roblox OAuth implementation](https://create.roblox.com/docs/cloud/auth/oauth2-develop)
- [Roblox OAuth reference](https://create.roblox.com/docs/cloud/auth/oauth2-reference)
- [Roblox Studio plugin asset picker (Animation only)](https://create.roblox.com/docs/reference/engine/classes/Plugin/PromptForExistingAssetIdAsync)
- [Roblox Studio file import](https://create.roblox.com/docs/reference/engine/classes/StudioService/PromptImportFileAsync)

Roblox is a registered trademark of Roblox Corporation. ALEX Reuploader is an independent tool.
