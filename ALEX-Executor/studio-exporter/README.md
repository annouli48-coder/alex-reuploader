# ALEX Studio Exporter — Roblox Studio local plugin

ALEX Studio Exporter is a **Roblox Studio plugin**, not a Roblox Player injector or remote game decompiler. It inventories the accessible contents of the open place, gives progress and activity logs, lets a creator save selected models and scripts through Studio's native export dialog, and explains how to save the complete place as an XML `.rbxlx` file.

## Install in Roblox Studio

1. Sign into Roblox Studio and open a place **you own or have permission to edit**.
2. In **Explorer → ServerStorage**, insert a new `Script`.
3. Open [ALEX_Studio_Exporter.plugin.luau](./ALEX_Studio_Exporter.plugin.luau), copy its **entire** source and paste it into the Script.
4. Select that Script and choose **Plugins → Save as Local Plugin**. Give it the name **ALEX Studio Exporter**.
5. **Delete the temporary Script from ServerStorage** after saving the plugin. You do not want the installer script to be included in your game.
6. Use **Plugins → ALEX Studio Exporter** to open the docked panel. If the button does not appear, check **PluginDebugService** and reload the plugin.

The plugin checks the signed-in Studio user with `StudioService:GetUserId()`. For user-owned published places it blocks export if the signed-in ID differs from the place creator ID. For group-owned and unpublished local places, **you remain responsible for confirming you have edit/export permission**; the plugin cannot reliably verify all team permissions.

## Use the buttons

- **SCAN PLACE:** Counts objects, script containers, models, BaseParts, and GUI objects in the open Studio place. Updates a progress bar and activity log. The same button cancels a long scan. It inventories objects; it does not execute scripts or transmit anything.
- **EXPORT SELECTED MODELS / SCRIPTS:** Select one or more objects in Studio Explorer and click Export. The plugin calls `Plugin:PromptSaveSelectionAsync`, which opens Studio's own save dialog. Choose `.rbxmx` for text/XML model exports or `.rbxm` for binary. Descendant scripts belonging to the selected model are saved as part of the normal Studio model export where supported.
- **FULL PLACE EXPORT (.RBXLX) GUIDE:** The full-place save must be performed through Studio itself: **File → Save to File**, then select **Roblox XML Place (`.rbxlx`)** when available. This retains the place's native hierarchy and accessible scripts. A selection export is a model file, not a full-place backup.

**Team Create:** If the XML option is unavailable, choose **File → Download a Copy**, open the downloaded place locally in Roblox Studio, then use **Save to File As → Roblox XML Place (`.rbxlx`)**. Save a separate copy instead of overwriting your working place.

## What the tool can and cannot export

- **Works:** The objects, scripts, and models **available in your current editable Roblox Studio project**. Studio's own save dialog determines which properties and script source can be serialized. Local copies of your own place work without additional servers.
- **Does not work:** Attaching to Roblox Player, injecting into someone else's session, retrieving ServerScriptService/ServerStorage or script `Source` from an unrelated live experience, bypassing Roblox permissions, or reconstructing hidden code. Roblox does not send inaccessible server code to the client.
- **No network dependency:** This Studio plugin makes no HTTP calls, uploads, logging telemetry, or external connections. There is no Railway/Discord requirement for these export features.

## Developer notes

The plugin uses the modern `CreateDockWidgetPluginGuiAsync` and `PromptSaveSelectionAsync` plugin APIs, `Selection`, and `StudioService`. A Studio-only installation is required: do **not** run it as a normal server Script. It is statically inspected, but final behavior in your installed Roblox Studio version still needs an in-Studio test.

Official references:
- [Roblox Studio plugins](https://create.roblox.com/docs/studio/plugins)
- [Roblox place files](https://create.roblox.com/docs/projects/place-files)
- [Plugin export selection API](https://create.roblox.com/docs/reference/engine/classes/Plugin)
- [StudioService:GetUserId](https://create.roblox.com/docs/reference/engine/classes/StudioService)
