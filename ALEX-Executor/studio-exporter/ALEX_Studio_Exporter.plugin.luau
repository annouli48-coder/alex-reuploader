--!strict
-- ALEX Studio Exporter V1
-- Local Studio plugin for places the operator owns or is authorized to edit.
-- Never attaches to Roblox Player and never retrieves non-replicated server code
-- from someone else's live experience.
-- Installation: Script in ServerStorage -> Plugins > Save as Local Plugin.
assert(plugin, "ALEX Studio Exporter must run as a Roblox Studio plugin")

local Selection = game:GetService("Selection")
local StudioService = game:GetService("StudioService")

local THEME = {
	bg = Color3.fromRGB(12, 15, 25),
	panel = Color3.fromRGB(22, 26, 44),
	panelBright = Color3.fromRGB(30, 34, 55),
	border = Color3.fromRGB(57, 63, 94),
	purple = Color3.fromRGB(174, 126, 255),
	purpleDark = Color3.fromRGB(91, 58, 153),
	text = Color3.fromRGB(238, 234, 250),
	muted = Color3.fromRGB(163, 171, 194),
	green = Color3.fromRGB(89, 227, 175),
	orange = Color3.fromRGB(252, 198, 125),
}

local SERVICE_NAMES = {
	"Workspace", "Lighting", "ReplicatedFirst", "ReplicatedStorage",
	"ServerScriptService", "ServerStorage", "StarterGui", "StarterPack",
	"StarterPlayer", "SoundService", "Teams", "Chat", "TextChatService",
}

local toolbar = plugin:CreateToolbar("ALEX Studio")
local toggle = toolbar:CreateButton(
	"ALEX Studio Exporter",
	"Scan and export content from an experience you can edit in Studio",
	""
)
toggle.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right, true, false, 410, 635, 335, 435
)
local widget = plugin:CreateDockWidgetPluginGuiAsync("ALEXStudioExporterV1", widgetInfo)
widget.Title = "ALEX | Studio Exporter"
toggle.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

local function instance(className: string, props: {[string]: any}, parent: Instance?): Instance
	local object = Instance.new(className)
	for prop, value in pairs(props) do
		(object :: any)[prop] = value
	end
	if parent then
		object.Parent = parent
	end
	return object
end

local function round(obj: GuiObject, radius: number)
	instance("UICorner", {CornerRadius = UDim.new(0, radius)}, obj)
end

local function stroke(obj: GuiObject, color: Color3, transparency: number?)
	instance("UIStroke", {
		Color = color, Transparency = transparency or 0,
		Thickness = 1,
	}, obj)
end

local function label(parent: Instance, value: string, height: number, fontSize: number, color: Color3, bold: boolean?): TextLabel
	return instance("TextLabel", {
		Text = value,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, height),
		Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham,
		TextColor3 = color,
		TextSize = fontSize,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Center,
	}, parent) :: TextLabel
end

local function button(parent: Instance, caption: string, background: Color3): TextButton
	local b = instance("TextButton", {
		Name = "Action",
		Text = caption,
		Font = Enum.Font.GothamBold,
		TextSize = 13,
		TextColor3 = THEME.text,
		BackgroundColor3 = background,
		BorderSizePixel = 0,
		Size = UDim2.new(1, 0, 0, 42),
		AutoButtonColor = true,
	}, parent) :: TextButton
	round(b, 9)
	stroke(b, THEME.border, 0.25)
	return b
end

local root = instance("ScrollingFrame", {
	Name = "ALEXWorkspace",
	BackgroundColor3 = THEME.bg,
	BorderSizePixel = 0,
	Size = UDim2.fromScale(1, 1),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	CanvasSize = UDim2.fromOffset(0, 0),
	ScrollBarThickness = 5,
	ScrollBarImageColor3 = THEME.purple,
}, widget) :: ScrollingFrame
instance("UIPadding", {
	PaddingTop = UDim.new(0, 17),
	PaddingBottom = UDim.new(0, 17),
	PaddingLeft = UDim.new(0, 16),
	PaddingRight = UDim.new(0, 16),
}, root)
instance("UIListLayout", {
	Padding = UDim.new(0, 12),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, root)

local header = instance("Frame", {
	Size = UDim2.new(1, 0, 0, 77),
	BackgroundColor3 = THEME.panel,
	BorderSizePixel = 0,
	LayoutOrder = 1,
}, root) :: Frame
round(header, 12)
stroke(header, THEME.border)
instance("UIPadding", {PaddingLeft = UDim.new(0, 14), PaddingTop = UDim.new(0, 10)}, header)
local brand = label(header, "✦  ALEX / STUDIO EXPORTER", 30, 17, THEME.text, true)
brand.Size = UDim2.new(1, -16, 0, 30)
local sub = label(header, "ROBLOX STUDIO  ·  ACCESSIBLE PLACE CONTENT", 23, 9, THEME.purple, true)
sub.Position = UDim2.fromOffset(1, 32)
sub.Size = UDim2.new(1, -18, 0, 23)

local statusPanel = instance("Frame", {
	Size = UDim2.new(1, 0, 0, 71),
	BackgroundColor3 = THEME.panel,
	LayoutOrder = 2,
	BorderSizePixel = 0,
}, root) :: Frame
round(statusPanel, 10)
stroke(statusPanel, THEME.border)
instance("UIPadding", {
	PaddingLeft = UDim.new(0, 12),
	PaddingRight = UDim.new(0, 12),
	PaddingTop = UDim.new(0, 7),
}, statusPanel)
local accessLabel = label(statusPanel, "Checking your Studio session...", 26, 12, THEME.orange, true)
local statusLabel = label(statusPanel, "Ready to scan", 25, 11, THEME.muted)
statusLabel.Position = UDim2.fromOffset(0, 27)

local progressOuter = instance("Frame", {
	Size = UDim2.new(1, 0, 0, 7),
	LayoutOrder = 3,
	BackgroundColor3 = THEME.panelBright,
	BorderSizePixel = 0,
}, root) :: Frame
round(progressOuter, 4)
local progressInner = instance("Frame", {
	Size = UDim2.fromScale(0, 1),
	BackgroundColor3 = THEME.purple,
	BorderSizePixel = 0,
}, progressOuter) :: Frame
round(progressInner, 4)

local actions = instance("Frame", {
	LayoutOrder = 4,
	Size = UDim2.new(1, 0, 0, 150),
	BackgroundTransparency = 1,
}, root) :: Frame
instance("UIListLayout", {Padding = UDim.new(0, 10)}, actions)
local scanButton = button(actions, "◈  SCAN PLACE", THEME.purpleDark)
local selectButton = button(actions, "▣  EXPORT SELECTED MODELS / SCRIPTS", THEME.panelBright)
local placeButton = button(actions, "↗  FULL PLACE EXPORT (.RBXLX) GUIDE", THEME.panelBright)

local countsPanel = instance("Frame", {
	LayoutOrder = 5, Size = UDim2.new(1, 0, 0, 92),
	BackgroundColor3 = THEME.panel, BorderSizePixel = 0,
}, root) :: Frame
round(countsPanel, 10)
stroke(countsPanel, THEME.border)
instance("UIPadding", {
	PaddingTop = UDim.new(0, 7), PaddingLeft = UDim.new(0, 12),
	PaddingRight = UDim.new(0, 12),
}, countsPanel)
local countHeader = label(countsPanel, "SCAN RESULTS", 20, 10, THEME.purple, true)
local counts = label(countsPanel, "Objects  —     Scripts  —     Models  —\nParts  —     UI elements  —", 57, 12, THEME.text, true)
counts.Position = UDim2.fromOffset(0, 23)
counts.TextYAlignment = Enum.TextYAlignment.Top

local logPanel = instance("Frame", {
	LayoutOrder = 6, Size = UDim2.new(1, 0, 0, 178),
	BackgroundColor3 = THEME.panel, BorderSizePixel = 0,
}, root) :: Frame
round(logPanel, 10)
stroke(logPanel, THEME.border)
instance("UIPadding", {
	PaddingTop = UDim.new(0, 10), PaddingLeft = UDim.new(0, 12),
	PaddingRight = UDim.new(0, 12), PaddingBottom = UDim.new(0, 8),
}, logPanel)
local logHeader = label(logPanel, "›_  EXPORT LOG", 21, 10, THEME.purple, true)
local log = label(logPanel, "ALEX initialized.\nNo downloads or external requests are made.", 140, 10, THEME.muted)
log.Position = UDim2.fromOffset(0, 24)
log.TextYAlignment = Enum.TextYAlignment.Top
log.TextWrapped = true

local guidePanel = instance("Frame", {
	LayoutOrder = 7, Size = UDim2.new(1, 0, 0, 117),
	BackgroundColor3 = Color3.fromRGB(35, 30, 56), BorderSizePixel = 0,
}, root) :: Frame
round(guidePanel, 10)
stroke(guidePanel, THEME.purpleDark)
instance("UIPadding", {
	PaddingTop = UDim.new(0, 10), PaddingLeft = UDim.new(0, 12),
	PaddingRight = UDim.new(0, 12),
}, guidePanel)
local guideTitle = label(guidePanel, "✧  SAVE FULL PLACE", 22, 11, THEME.purple, true)
local guide = label(guidePanel,
	"File → Save to File / Download a Copy. Choose Roblox XML Place (*.rbxlx) for a complete editable place snapshot. This uses Studio's own saver.",
	77, 11, THEME.text)
guide.Position = UDim2.fromOffset(0, 24)
guide.TextYAlignment = Enum.TextYAlignment.Top

local entries = {"[ALEX] Ready. Open an experience you own or have permission to edit."}
local function logMessage(message: string)
	table.insert(entries, os.date("%H:%M:%S") .. "  " .. message)
	if #entries > 7 then
		table.remove(entries, 1)
	end
	log.Text = table.concat(entries, "\n")
	print("[ALEX Studio Exporter] " .. message)
end

local function userCanAccess(): (boolean, string)
	local studioUserId = 0
	local ok, result = pcall(function()
		return StudioService:GetUserId()
	end)
	if ok then studioUserId = result end
	if studioUserId == 0 then
		return false, "Sign in to Studio to export."
	end
	if game.CreatorType == Enum.CreatorType.User and game.CreatorId ~= 0 then
		if game.CreatorId ~= studioUserId then
			return false, "Place owner differs from your Studio account."
		end
		return true, "✓ User-owned place · ID " .. tostring(studioUserId)
	end
	if game.CreatorType == Enum.CreatorType.Group then
		return true, "Group place · verify your edit permission"
	end
	-- Unpublished local projects may have CreatorId 0.
	return true, "Local / unpublished Studio project"
end

local function verifyAccess(): boolean
	local authorized, explanation = userCanAccess()
	accessLabel.Text = explanation
	accessLabel.TextColor3 = authorized and THEME.green or THEME.orange
	if not authorized then
		statusLabel.Text = "Export blocked. Open an owned or editable place."
		logMessage("Blocked: " .. explanation)
	end
	return authorized
end

verifyAccess()
local running = false
local cancelling = false

local function scanPlace()
	if running then
		cancelling = true
		statusLabel.Text = "Stopping scan..."
		return
	end
	if not verifyAccess() then return end
	running = true
	cancelling = false
	scanButton.Text = "■  STOP SCAN"
	progressInner.Size = UDim2.fromScale(0, 1)
	statusLabel.Text = "Scanning open Studio place..."

	local queue: {Instance} = {}
	for _, name in ipairs(SERVICE_NAMES) do
		local ok, service = pcall(function() return game:GetService(name) end)
		if ok and service then
			table.insert(queue, service)
		end
	end

	local found = {objects = 0, scripts = 0, models = 0, parts = 0, gui = 0}
	local index = 1
	while index <= #queue do
		if cancelling then break end
		local object = queue[index]
		index += 1
		found.objects += 1
		if object:IsA("LuaSourceContainer") then found.scripts += 1 end
		if object:IsA("Model") then found.models += 1 end
		if object:IsA("BasePart") then found.parts += 1 end
		if object:IsA("GuiObject") then found.gui += 1 end

		local ok, children = pcall(function() return object:GetChildren() end)
		if ok then
			for _, child in ipairs(children) do
				table.insert(queue, child)
			end
		end
		if index % 200 == 0 then
			statusLabel.Text = "Scanning " .. tostring(found.objects) .. " objects..."
			progressInner.Size = UDim2.fromScale(math.clamp(index / math.max(#queue, 1), 0.01, 0.98), 1)
			task.wait()
		end
	end

	counts.Text = ("Objects  %s     Scripts  %s     Models  %s\nParts  %s     UI elements  %s"):format(
		tostring(found.objects), tostring(found.scripts), tostring(found.models),
		tostring(found.parts), tostring(found.gui)
	)
	progressInner.Size = UDim2.fromScale(cancelling and 0 or 1, 1)
	statusLabel.Text = cancelling and "Scan cancelled." or ("Scan complete · " .. tostring(found.objects) .. " objects")
	logMessage(cancelling and "Scan cancelled. Results are partial." or
		("Scanned " .. tostring(found.objects) .. " items; found " .. tostring(found.scripts) .. " scripts."))
	running = false
	cancelling = false
	scanButton.Text = "◈  SCAN PLACE"
end

scanButton.MouseButton1Click:Connect(function()
	task.spawn(function()
		local ok, err = pcall(scanPlace)
		if not ok then
			running = false
			cancelling = false
			scanButton.Text = "◈  SCAN PLACE"
			statusLabel.Text = "Scan error; see log."
			logMessage("Scan error: " .. tostring(err))
		end
	end)
end)

selectButton.MouseButton1Click:Connect(function()
	if running then logMessage("Finish or stop the scan before exporting."); return end
	if not verifyAccess() then return end
	local selected = Selection:Get()
	if #selected == 0 then
		logMessage("Select a model or scripts in Studio Explorer first.")
		statusLabel.Text = "Nothing selected in Explorer."
		return
	end
	for _, object in ipairs(selected) do
		if not object:IsDescendantOf(game) then
			logMessage("Selection includes objects outside the open place.")
			return
		end
	end

	statusLabel.Text = "Studio export dialog opened..."
	logMessage("Exporting " .. tostring(#selected) .. " selected items with native Studio saver.")
	task.spawn(function()
		local ok, completed = pcall(function()
			return plugin:PromptSaveSelectionAsync("ALEX_Selected_Objects")
		end)
		if not ok then
			statusLabel.Text = "Export failed."
			logMessage("Studio save dialog error: " .. tostring(completed))
		elseif completed then
			statusLabel.Text = "Selected items exported."
			logMessage("Saved selected models/scripts. Use .rbxmx for XML models.")
		else
			statusLabel.Text = "Export cancelled."
			logMessage("Selection export cancelled.")
		end
	end)
end)

placeButton.MouseButton1Click:Connect(function()
	if not verifyAccess() then return end
	statusLabel.Text = "Use the File menu in Roblox Studio."
	logMessage("For .rbxlx, choose File → Save to File, then Roblox XML Place.")
	logMessage("If Team Create restricts XML export, Download a Copy, open it, then Save to File.")
end)

plugin.Unloading:Connect(function()
	cancelling = true
end)
