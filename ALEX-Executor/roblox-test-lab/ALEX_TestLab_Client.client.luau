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
