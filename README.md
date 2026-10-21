# ALEX Reuploader V1.9 — persistent background jobs

## New: reupload after closing your computer
- Run on **Node.js 22.5+**. Attach a **persistent Railway Volume** to the existing service (example mount `/data`). The `RAILWAY_VOLUME_MOUNT_PATH` variable is provided by Railway; the server stores `alex-reuploader-jobs.sqlite` there automatically. Use a *single replica* and keep the service running; don't enable sleep/scale-to-zero.
- Keep `ALEX_SESSION_SECRET` or `ROBLOX_OAUTH_CLIENT_SECRET` unchanged: the SQLite records store AES-GCM-encrypted session cookies, **never plaintext OAuth tokens**. Protect Railway database backups and credentials.
- Sign in, choose **Automatically reupload my own assets**, then tick **Run reuploads on Railway after I close my browser**. Choose your `.rbxl` once to send only the list of asset IDs to Railway. The file itself stays local.
- You can close the browser after the queue is accepted. Return later to the Reupload queue, refresh progress, select the *same original* `.rbxl`, and click **Download rebuilt .RBXL** after maps appear.
- Server persists queue items, accepted Roblox operation IDs, results and per-day app usage. Skips third-party/private media. Retries safe operation-status polling and resumes rate-limited queues later; uncertain upload submissions require review to prevent duplicates. Pauses when login expires and awaits new sign-in; an ambiguous in-flight POST after a restart is marked for **manual review**, never blindly retried.
- Uploads are limited to your confirmed tier and Roblox's own quotas. One queued job per user; max **30,000 distinct IDs** per job. Long queues may take days/months; supported source media still depends on Roblox permissions and actual format. Logout pauses jobs.
- Only the exact owner can view or control their queue. Browser uses existing session + CSRF checks. No `.rbxl` bytes or media data are saved on Railway. The browser must remain available later to rebuild the place.
- All effects on Roblox are creator-authorized only. New code has NOT been deployed to your Railway service, and **live Roblox OAuth / large production jobs have not been verified**. Test with a tiny place and 2–3 assets first, including an app restart.

## Railway deployment steps
1. Back up the existing repo and Railway variables.
2. Deploy this package at the same root directory as V1.8, keeping existing OAuth client ID, secret, redirect URL, public URL and session-secret values.
3. Configure Node.js **22.5+** and mount a Railway Volume on this service at `/data` (it will provide `RAILWAY_VOLUME_MOUNT_PATH`). Do not use ephemeral `/tmp` or the default application filesystem for the SQLite database.
4. Use a single Railway service replica. Run `npm start`; watch for `ALEX persistent background worker running on mounted volume` in logs.
5. Test a small owned-asset reupload, close the browser, then reopen after the job finishes. Download rebuilt `.rbxl` locally and inspect it in Studio. Never assume game changes publish automatically.
6. Back up the mounted volume. If your OAuth secret or ALEX_SESSION_SECRET changes, older encrypted sessions become invalid, and jobs must be restarted after signing in again.

---
# ALEX Reuploader — Multi-Asset RBXL Rebuild V10 (large scans)

Creator-authorized Roblox asset reupload workspace with a native `.rbxl` place-file scanner, account-owned media reupload automation, and browser-based `.rbxl` rewriting. Railway-ready and no Studio plugin needed for the automatic workflow.

## What works

- The website file picker accepts **only `.rbxl`** Roblox place files (binary format). It reads the file locally in the browser, finds common audio, animation, image, decal, texture, mesh, model, and video ID references, and displays location counts and asset-ID lists. The place file is never uploaded to ALEX.
- The `.rbxl` parser handles modern Zstandard (ZSTD), legacy LZ4, and uncompressed chunks, including mixed-compression files. It recognizes explicit asset URLs and `Content.fromAssetId` references embedded in scripts, alongside a broad set of external-asset properties and value objects serialized as strings.
- **No arbitrary 30,000-reference scan cutoff.** Large files are scanned for all recognized references within the 150 MB browser file-size and safe binary-format processing limits. The asset table displays 250 records at a time with a Show More button, while searching, reference counts, mappings, and reuploads use the full detected list.
- After sign-in, users can explicitly opt into automatic reuploads. Selecting an `.rbxl` triggers a sequential attempt to retrieve each scanned external asset using Roblox OAuth. The backend checks creator metadata: source assets must belong to the signed-in user or to the selected destination group, and Roblox must authorize both reading the original and creating a replacement. Missing, private, unrecognized, or denied media are skipped. The UI has a stop button for long scans.
- Successful uploads are mapped and rewritten directly into a **new** `.rbxl` file. The download starts after the automatic pass; a manual download button is also available. Unmodified RBXL chunks are preserved, while changed property chunks are encoded uncompressed. The original place file is never altered or uploaded to ALEX.
- No Studio plugin or manual `old_id=new_id` mapping is required or offered by the website.
- Sign in with Roblox using **OAuth 2.0 authorization code + PKCE**; app secrets stay on the server.
- Login survives page refreshes and Railway process restarts through an encrypted, HttpOnly, Secure-on-HTTPS session cookie. OAuth refresh-token changes are saved back to the cookie; the browser never reads the Roblox tokens.
- Login status checks now start independently of local scan rendering. A missing scan counter that previously caused a JavaScript error, leaving the interface stuck on **Guest / Configuration needed** after Roblox OAuth returned, is restored and covered by a regression test.
- Optional destination group and Ultra-only custom descriptions are available in the scanner automation settings. Group upload permission is checked by Roblox; entering a group ID does not grant upload permission.
- Poll Roblox's asset operation to obtain each new asset ID; then download the newly rebuilt `.rbxl` with the matching asset references automatically rewritten. There is no separate media-upload form or mapping step on the website.
- Verify the configured Roblox gamepasses server-side. Owner accounts `9140908042` and `10290256654` receive Ultra; other users receive their highest verified pass. Ultra adds custom asset descriptions.
- Browser keeps the scan and successful mappings locally (no source media stored by the app). Media is sent to Roblox on upload.
- A large scan is kept in the current browser tab. If its item list is too large for small localStorage quotas, ALEX saves its ID mappings but asks you to choose the same `.rbxl` again after a refresh instead of silently restoring only the first 10,000 IDs.

## Run locally

Use Node.js 20 or later. Install the lightweight Zstandard decoding dependency before running:

```sh
cd alex-reuploader
npm install
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
| `ALEX_SESSION_SECRET` | Optional dedicated, strong private key for session encryption. Keep unchanged across deployments; by default the app derives this key from `ROBLOX_OAUTH_CLIENT_SECRET`. |
| `PORT` | Not necessary; Railway injects it automatically |

**Do not publish an OAuth secret, Roblox `.ROBLOSECURITY` cookie, or API key in public HTML or GitHub.** This app uploads through the individual user's scoped OAuth session; it does **not** require `ROBLOX_ASSET_API_KEY` or any Roblox cookie.

### Scan, automatically reupload, and rebuild your .RBXL file

1. Open your own experience in Roblox Studio.
2. Use **File → Save to File** and save the place in binary `.rbxl` format.
3. Open the ALEX website and **Sign in with Roblox**.
4. Go to **Asset scanner**. For hands-free eligible source uploads, check **Automatically reupload my own assets**. Choosing this option explicitly authorizes new Roblox uploads, which consume Roblox upload quotas.
5. Click **Choose .RBXL file**. ALEX reads the local file and finds external asset references across common string-encoded properties and scripts. A large file may contain thousands of references; the sequential upload pass is limited by plan quota and can be stopped.
   Scanning has no fixed asset-reference count cap. The app still has practical file, instance, decompression, and browser-memory safety limits. Scanning and actually uploading assets are separate operations: Ultra allows up to 100 accepted app uploads per day, not unlimited Roblox uploads.
6. The server only reuploads source assets for which Roblox's creator metadata confirms the **signed-in user or selected group** owns the asset, and only if Roblox grants access to the actual media bytes. Assets owned by unrelated creators, unsupported categories, and inaccessible formats are skipped, even if the .rbxl references them.
7. After eligible uploads complete, ALEX automatically downloads `GAME_ALEX_REUPLOADED.rbxl` with successful ID replacements. Click **Download rebuilt .RBXL** if your browser blocks the automatic download. Check the changed game in Studio before publishing it yourself.

The browser cannot rewrite a source asset it cannot legitimately retrieve. The original `.rbxl` is never modified. Rebuilt files are new copies, **not** automatically published live experiences. ALEX does not guarantee all asset IDs are replaceable: only supported serialized string properties and explicit asset references inside script sources are rewritten.

The site file picker intentionally **does not** accept `.rbxlx`, `.rbxmx`, `.rbxm`, `.json` or `.csv`. Binary RBXL parsing is best-effort: unknown future property types or encrypted/non-standard serialization may not be recognized. The browser file-size limit is 150 MB.

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
- This automatic version supports Roblox's Assets API upload types: audio, animation, image/decal, mesh, model, and video, provided original asset content is accessible in a supported file format and no larger than this application's 20 MB cap. Some decal IDs deliver a Roblox asset wrapper instead of an uploadable image and will be skipped. Roblox may create models as packages rather than interchangeable raw assets.
- Audio must meet Roblox's duration and upload quota limits; maximum media file size here is 20 MB.
- A successful API request may return a processing operation, which the website polls automatically. If polling times out, verify on Creator Dashboard before retrying to avoid duplicate uploads.
- Encrypted session cookies work across Railway refreshes, restarts, and replicas, provided the server's OAuth secret (or `ALEX_SESSION_SECRET`) remains the same. Sessions expire after seven days of inactivity; sign-in is required if Roblox revokes the refresh token or the encryption key changes. Logging out clears the browser cookie and blocks that session in the current process. For full cross-replica logout revocation, add shared revocation storage.
- Rate counts, OAuth authorization state, and upload deduplication remain in process memory. Deploy as **one Railway replica** until you add a persistent database and account-specific throttles; restarts reset app-side counters.
- The parser inspects only the local `.rbxl` supplied by its owner. It cannot read other users' private running-game server services or enumerate Roblox's private Asset Manager database.
- Upload descriptions are intentionally disabled unless Ultra entitlement is server-verified.

## Official documentation

- [Roblox Open Cloud Asset API usage guide](https://create.roblox.com/docs/cloud/guides/usage-assets)
- [Roblox OAuth implementation](https://create.roblox.com/docs/cloud/auth/oauth2-develop)
- [Roblox OAuth reference](https://create.roblox.com/docs/cloud/auth/oauth2-reference)
- [Roblox Open Cloud asset reference](https://create.roblox.com/docs/cloud/reference/features/assets)

Roblox is a registered trademark of Roblox Corporation. ALEX Reuploader is an independent tool.
