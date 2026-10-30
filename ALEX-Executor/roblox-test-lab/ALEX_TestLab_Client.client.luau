-- ALEX TEST LAB V1 — touchscreen-compatible Roblox creator test console
-- Place LocalScript in StarterPlayer > StarterPlayerScripts.
local Players=game:GetService("Players")
local ReplicatedStorage=game:GetService("ReplicatedStorage")
local player=Players.LocalPlayer
local remote=ReplicatedStorage:WaitForChild("ALEX_TestLab_V1",20)
if not remote then warn("[ALEX] Server test script not installed"); return end
local gui=Instance.new("ScreenGui")
gui.Name="ALEX_TestLab_GUI"
gui.ResetOnSpawn=false
gui.ZIndexBehavior=Enum.ZIndexBehavior.Sibling
gui.Parent=player:WaitForChild("PlayerGui")
local function make(class,props,parent)
    local x=Instance.new(class)
    for k,v in pairs(props) do x[k]=v end
    x.Parent=parent
    return x
end
local function corner(x,radius)
    make("UICorner",{CornerRadius=UDim.new(0,radius)},x)
end
local light=Color3.fromRGB(237,219,255)
local muted=Color3.fromRGB(183,161,204)
local broadcast=make("TextLabel",{
    Size=UDim2.new(0.92,0,0,42),Position=UDim2.new(0.04,0,0,54),
    BackgroundColor3=Color3.fromRGB(41,16,66),BorderSizePixel=0,
    TextColor3=light,TextSize=14,Font=Enum.Font.GothamBold,TextWrapped=true,
    Visible=false,Text="",ZIndex=40,
},gui)
corner(broadcast,9)
local toastCount=0
local function toast(text)
    toastCount+=1
    local n=toastCount
    broadcast.Text="✦ "..tostring(text):sub(1,170)
    broadcast.Visible=true
    task.delay(4,function()
        if n==toastCount then broadcast.Visible=false end
    end)
end
local toggle=make("TextButton",{
    Size=UDim2.fromOffset(100,38),Position=UDim2.new(1,-110,0,8),
    BackgroundColor3=Color3.fromRGB(110,52,192),Text="ALEX  ✦",
    TextColor3=light,TextSize=15,Font=Enum.Font.GothamBold,Visible=false,
},gui)
corner(toggle,9)
local panel=make("Frame",{
    AnchorPoint=Vector2.new(0.5,0.5),Position=UDim2.fromScale(0.5,0.53),
    Size=UDim2.new(0.94,0,0.78,0),
    BackgroundColor3=Color3.fromRGB(16,10,25),BorderSizePixel=0,Visible=false,
},gui)
corner(panel,12)
make("UISizeConstraint",{MaxSize=Vector2.new(730,600)},panel)
make("UIStroke",{Color=Color3.fromRGB(87,48,124),Thickness=2},panel)
local header=make("Frame",{
    Size=UDim2.new(1,0,0,43),BackgroundColor3=Color3.fromRGB(43,22,64),
    BorderSizePixel=0,
},panel)
corner(header,12)
make("TextLabel",{
    Size=UDim2.new(1,-68,1,0),Position=UDim2.fromOffset(13,0),
    BackgroundTransparency=1,Text="ALEX  •  CREATOR TEST LAB",
    TextColor3=light,TextSize=15,Font=Enum.Font.GothamBold,
    TextXAlignment=Enum.TextXAlignment.Left,
},header)
local close=make("TextButton",{
    Size=UDim2.fromOffset(35,30),Position=UDim2.new(1,-42,0,6),
    BackgroundColor3=Color3.fromRGB(88,44,116),Text="×",
    TextColor3=light,TextSize=23,Font=Enum.Font.GothamBold,
},header)
corner(close,6)
close.MouseButton1Click:Connect(function() panel.Visible=false end)
toggle.MouseButton1Click:Connect(function() panel.Visible=not panel.Visible end)
make("TextLabel",{
    Size=UDim2.new(1,-20,0,35),Position=UDim2.fromOffset(10,47),
    BackgroundTransparency=1,
    Text="PRIVATE TEST SERVER · Server-created changes replicate to all players.",
    TextColor3=muted,TextSize=12,Font=Enum.Font.Gotham,
    TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left,
},panel)
local editor=make("TextBox",{
    Size=UDim2.new(1,-20,1,-235),Position=UDim2.fromOffset(10,84),
    BackgroundColor3=Color3.fromRGB(9,6,16),BorderSizePixel=0,
    TextColor3=light,PlaceholderColor3=muted,
    ClearTextOnFocus=false,MultiLine=true,TextWrapped=false,
    TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top,
    TextSize=14,Font=Enum.Font.Code,
    Text=[[-- Copy/paste your Luau here
local part = ALEX.spawnPart("ALEX_CUBE", Vector3.new(0, 12, 0))
part.Size = Vector3.new(7, 7, 7)
ALEX.showForAll("ALEX test started!")
print("Visible to the whole server")]],
},panel)
corner(editor,8)
local buttonRow=make("Frame",{
    Size=UDim2.new(1,-20,0,39),Position=UDim2.new(0,10,1,-143),
    BackgroundTransparency=1,
},panel)
make("UIListLayout",{
    FillDirection=Enum.FillDirection.Horizontal,
    Padding=UDim.new(0,7),
    SortOrder=Enum.SortOrder.LayoutOrder,
},buttonRow)
local function button(text,color,order)
    local b=make("TextButton",{
        Size=UDim2.new(0.33,-5,1,0),BackgroundColor3=color,
        Text=text,TextColor3=Color3.new(1,1,1),
        Font=Enum.Font.GothamBold,TextSize=13,LayoutOrder=order,
    },buttonRow)
    corner(b,7)
    return b
end
local run=button("▶ EXECUTE",Color3.fromRGB(119,50,201),1)
local clear=button("CLEAR TESTS",Color3.fromRGB(72,39,98),2)
local example=button("EXAMPLE",Color3.fromRGB(50,48,74),3)
local output=make("TextLabel",{
    Size=UDim2.new(1,-20,0,85),Position=UDim2.new(0,10,1,-96),
    BackgroundColor3=Color3.fromRGB(9,7,15),BorderSizePixel=0,
    TextColor3=Color3.fromRGB(162,226,194),Font=Enum.Font.Code,TextSize=12,
    TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top,
    TextWrapped=true,Text="OUTPUT  •  checking owner permission...",
},panel)
corner(output,7)
local lines={}
local function log(s)
    table.insert(lines,tostring(s))
    while #lines>5 do table.remove(lines,1) end
    output.Text=table.concat(lines,"\n")
end
local requestId=0
run.MouseButton1Click:Connect(function()
    requestId+=1
    if editor.Text=="" then log("Paste a script first."); return end
    if #editor.Text>16000 then log("Maximum script length is 16000."); return end
    log("Executing on private game server...")
    remote:FireServer("execute",requestId,editor.Text)
end)
clear.MouseButton1Click:Connect(function()
    remote:FireServer("clear",requestId)
end)
example.MouseButton1Click:Connect(function()
    editor.Text=[[local part=ALEX.spawnPart("ALEX_TEST", Vector3.new(0,12,0))
part.Size=Vector3.new(7,7,7)
ALEX.showForAll("Developer anti-cheat test running!")
print("Spawned server-visible test cube")]]
end)
remote.OnClientEvent:Connect(function(kind,data)
    if kind=="broadcast" then
        toast(data)
    elseif kind=="welcome" and type(data)=="table" then
        if data.allowed then
            toggle.Visible=true
            panel.Visible=true
            log("Authorized creator test console ready.")
            log("Only use trusted code in your separate test place.")
        else
            warn("[ALEX] "..tostring(data.message))
        end
    elseif kind=="log" and toggle.Visible then
        log(data)
    end
end)
remote:FireServer("hello")

-- ALEX UI V2: drag, resize, custom theme/background, and font size.
-- This touch-ready interface appears ONLY in the creator-authorized test place.
local UserInputService=game:GetService("UserInputService")
local accent=Color3.fromRGB(119,50,201)
local themeColors={
    Purple=Color3.fromRGB(119,50,201),
    Blue=Color3.fromRGB(37,115,202),
    Green=Color3.fromRGB(23,141,111),
    Pink=Color3.fromRGB(188,66,142),
}
local editorColors={
    Midnight=Color3.fromRGB(9,6,16),
    Black=Color3.fromRGB(2,2,5),
    Slate=Color3.fromRGB(20,32,48),
    Plum=Color3.fromRGB(40,16,52),
}
local settingsToggle=make("TextButton",{
    Size=UDim2.fromOffset(35,30),Position=UDim2.new(1,-83,0,6),
    BackgroundColor3=Color3.fromRGB(88,44,116),Text="⚙",
    TextColor3=light,TextSize=19,Font=Enum.Font.GothamBold,
},header)
corner(settingsToggle,6)
local settingsFrame=make("Frame",{
    Size=UDim2.new(1,-24,0,246),Position=UDim2.fromOffset(12,47),
    BackgroundColor3=Color3.fromRGB(32,19,47),BorderSizePixel=0,
    Visible=false,ZIndex=20,
},panel)
corner(settingsFrame,10)
make("UIStroke",{Color=Color3.fromRGB(128,77,175),Thickness=1},settingsFrame)
local function settingLabel(text,y)
    return make("TextLabel",{
        Size=UDim2.new(1,-20,0,24),Position=UDim2.fromOffset(10,y),
        BackgroundTransparency=1,Text=text,TextColor3=light,
        TextSize=12,Font=Enum.Font.GothamBold,
        TextXAlignment=Enum.TextXAlignment.Left,ZIndex=21,
    },settingsFrame)
end
local function settingButton(name,text,x,y,width,action)
    local b=make("TextButton",{
        Name=name,Size=UDim2.fromOffset(width,27),
        Position=UDim2.fromOffset(x,y),
        BackgroundColor3=Color3.fromRGB(73,43,106),
        BorderSizePixel=0,Text=text,TextColor3=light,
        TextSize=12,Font=Enum.Font.GothamBold,ZIndex=21,
    },settingsFrame)
    corner(b,6)
    b.MouseButton1Click:Connect(action)
    return b
end
settingsToggle.MouseButton1Click:Connect(function()
    settingsFrame.Visible=not settingsFrame.Visible
end)
settingLabel("COLOR THEME",7)
local currentTheme="Purple"
local themeNames={"Purple","Blue","Green","Pink"}
for i,name in ipairs(themeNames) do
    settingButton("Theme"..name,name,10+(i-1)*66,31,62,function()
        currentTheme=name
        accent=themeColors[name]
        toggle.BackgroundColor3=accent
        run.BackgroundColor3=accent
        header.BackgroundColor3=accent:Lerp(Color3.new(0,0,0),0.57)
    end)
end
settingLabel("CODE BACKGROUND",66)
local backgroundNames={"Midnight","Black","Slate","Plum"}
for i,name in ipairs(backgroundNames) do
    settingButton("Background"..name,name,10+(i-1)*66,91,62,function()
        editor.BackgroundColor3=editorColors[name]
    end)
end
settingLabel("CODE TEXT SIZE",126)
local sizeValue=make("TextLabel",{
    Size=UDim2.fromOffset(85,27),Position=UDim2.fromOffset(77,150),
    BackgroundTransparency=1,Text="14 px",TextColor3=light,
    Font=Enum.Font.GothamBold,TextSize=14,ZIndex=21,
},settingsFrame)
settingButton("Smaller","A−",10,150,59,function()
    editor.TextSize=math.max(11,editor.TextSize-1)
    sizeValue.Text=tostring(editor.TextSize).." px"
end)
settingButton("Larger","A+",167,150,59,function()
    editor.TextSize=math.min(26,editor.TextSize+1)
    sizeValue.Text=tostring(editor.TextSize).." px"
end)
settingLabel("Drag the top bar to move · bottom-right to resize",191)
local resizeHandle=make("TextButton",{
    Name="ResizeHandle",Size=UDim2.fromOffset(38,34),
    AnchorPoint=Vector2.new(1,1),
    Position=UDim2.new(1,-3,1,-3),
    Text="◢",TextColor3=Color3.fromRGB(214,180,249),
    TextSize=21,Font=Enum.Font.GothamBold,
    BackgroundColor3=Color3.fromRGB(41,24,59),
    BackgroundTransparency=0.15,
    ZIndex=12,
},panel)
corner(resizeHandle,7)
-- UI constraints are clamped to the active viewport, including phones in portrait.
local dragSession=nil
local function viewport()
    local camera=workspace.CurrentCamera
    if camera then return camera.ViewportSize end
    return Vector2.new(800,600)
end
local function beginMotion(input,mode)
    if input.UserInputType~=Enum.UserInputType.MouseButton1 and
       input.UserInputType~=Enum.UserInputType.Touch then return end
    local center=panel.AbsolutePosition+panel.AbsoluteSize/2
    dragSession={
        source=input,mode=mode,
        start=input.Position,
        center=center,
        size=panel.AbsoluteSize,
    }
end
header.InputBegan:Connect(function(input)
    if settingsFrame.Visible then return end
    beginMotion(input,"drag")
end)
resizeHandle.InputBegan:Connect(function(input)
    beginMotion(input,"resize")
end)
UserInputService.InputChanged:Connect(function(input)
    local state=dragSession
    if not state then return end
    if input~=state.source and not (
        state.source.UserInputType==Enum.UserInputType.MouseButton1
        and input.UserInputType==Enum.UserInputType.MouseMovement
    ) then return end
    local delta=input.Position-state.start
    local v=viewport()
    if state.mode=="drag" then
        local half=panel.AbsoluteSize/2
        local x=math.clamp(state.center.X+delta.X,half.X,v.X-half.X)
        local y=math.clamp(state.center.Y+delta.Y,half.Y,v.Y-half.Y)
        panel.Position=UDim2.fromOffset(x,y)
    else
        local maxWidth=math.max(220,math.min(730,v.X-12))
        local maxHeight=math.max(240,math.min(600,v.Y-12))
        local w=math.clamp(state.size.X+delta.X,math.min(maxWidth,280),maxWidth)
        local h=math.clamp(state.size.Y+delta.Y,math.min(maxHeight,300),maxHeight)
        panel.Size=UDim2.fromOffset(w,h)
    end
end)
UserInputService.InputEnded:Connect(function(input)
    if dragSession and input==dragSession.source then dragSession=nil end
end)
