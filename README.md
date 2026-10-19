# ALEX Reuploader

Creator-authorized Roblox asset reupload workspace with a Studio plugin and a Railway-ready website.

## What works

- Studio plugin scans all asset references, or only sounds and animations (including modern `AudioPlayer` references), in the current selection or the entire open place. The website groups by old ID and displays service-level location counts, audio/animation counts, and read-only script/value reference counts.
- Like the scanning options demonstrated in Harmless Asset Manager, the plugin includes optional **SCRIPT IDS** and **VALUE IDS** source switches, as well as a path filter (e.g., `ReplicatedStorage.Animations`). These source scans only extract clearly associated sound/animation IDs, not arbitrary numbers or script contents.
- Use the Studio animation asset picker to select existing animations not currently placed in the game, and import saved `.json` scans from inside the plugin.
- Import `.json`, `.csv`, `.rbxmx` (Roblox XML model) or `.rbxlx` (Roblox XML place) files on the website. XML imports extract Sound/AudioPlayer/Animation references directly in the browser without uploading the scan file to the server. CSV needs `assetId,type` columns.
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

Open `http://localhost:3000`. You can import scans without OAuth credentials. Actual sign-in and upload need configuration below.

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

### Set up the Studio plugin

The included `studio/ALEX_REUPLOADER_PLUGIN.rbxmx` is a **Studio plugin**, not an executor script.

1. Import the plugin into Roblox Studio as a local plugin.
2. Open the toolbar's **ALEX Reuploader** panel.
3. Click **SCAN SOUNDS + ANIMATIONS** to find media references, or **SCAN ALL ASSET REFERENCES** for every supported asset property. Select model(s) first to limit the scan; leaving nothing selected scans the whole place. Enable the **SCRIPT IDS** or **VALUE IDS** switches to include recognizable IDs in script assignments or numeric/string values. You may optionally enter a path such as `ReplicatedStorage.Animations`.
4. To add an animation from your own Roblox inventory that is not used in your place, click **PICK AN ANIMATION FROM MY ASSETS**. For a previously saved Studio scan, use **IMPORT A SAVED SCAN (.JSON)**. Studio's public plugin picker currently supports animations only, not an exhaustive Asset Manager inventory of sounds.
5. Copy the JSON into the website's **Asset scanner**, or upload a `.json`, `.csv`, `.rbxmx` or `.rbxlx` scan file there. The website shows sound/animation counts, unique IDs, and where it found them. `.rbxmx`/`.rbxlx` XML files scan recognizable script and value references as well as instance properties. Binary `.rbxm` and `.rbxl` files must be opened in Studio and scanned with the plugin or re-exported as XML; they cannot be directly imported into this website. The plugin cannot list every sound shown in Studio's Asset Manager.
6. For each supported asset, use **Upload ↗**, select its own original file, and publish. You must have rights to that file.
7. Copy the resulting `old_id=new_id` map from **Reupload queue** and paste it into the plugin's second text box.
8. Click **APPLY ID MAP TO STUDIO**. Use Ctrl+Z in Studio to undo if needed.

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
