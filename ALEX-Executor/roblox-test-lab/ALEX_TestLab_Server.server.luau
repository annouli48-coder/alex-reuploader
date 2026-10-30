-- ALEX TEST LAB V1 — OWNER-ONLY SERVER TEST RUNNER
-- Place in ServerScriptService in your own separate Roblox test experience.
-- Requires Game Settings > Security > Enable Loadstring ON. Never use in production.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TextService = game:GetService("TextService")
local ServerScriptService = game:GetService("ServerScriptService")

local TRUSTED_USER_IDS = {[9140908042]=true,[10290256654]=true}
local GROUP_OWNED_TEST_PLACE_IDS = {} -- Add only owned group test place IDs manually.
local MAX_SCRIPT_LENGTH, MAX_RUNNING_SCRIPTS, EXECUTE_COOLDOWN = 16000, 5, 2
local MAX_EXECUTION_SECONDS = 15
local remote = ReplicatedStorage:FindFirstChild("ALEX_TestLab_V1")
if not remote then
    remote = Instance.new("RemoteEvent")
    remote.Name = "ALEX_TestLab_V1"
    remote.Parent = ReplicatedStorage
end
local roots = Instance.new("Folder")
roots.Name = "ALEX_TestLab_Temporary"
roots.Parent = workspace
local sessions = {}

local function isPrivate()
    return RunService:IsStudio() or game.PrivateServerId ~= ""
end
local function isOwner(player)
    if RunService:IsStudio() and player.UserId <= 0 then return true end
    if not TRUSTED_USER_IDS[player.UserId] then return false end
    local ownPlace = game.CreatorType == Enum.CreatorType.User and game.CreatorId == player.UserId
    return ownPlace or GROUP_OWNED_TEST_PLACE_IDS[game.PlaceId] == true
end
local function authorized(player)
    return isPrivate() and isOwner(player)
end
local function reply(player,kind,data,id)
    if player.Parent==Players then remote:FireClient(player,kind,data,id) end
end
local function log(player,message,id)
    reply(player,"log",tostring(message):sub(1,1000),id)
end
local function createSession(player)
    if sessions[player] then return sessions[player] end
    local folder=Instance.new("Folder")
    folder.Name="ALEX_"..tostring(player.UserId)
    folder.Parent=roots
    local session={owner=player,root=folder,active=true,threads={},cleanups={},running=0,lastExecute=0}
    sessions[player]=session
    return session
end
local function clearSession(player)
    local session=sessions[player]
    if not session then return end
    sessions[player]=nil
    session.active=false
    for _,fn in ipairs(session.cleanups) do pcall(fn) end
    for thread in pairs(session.threads) do
        if coroutine.status(thread)~="dead" then pcall(task.cancel,thread) end
    end
    if session.root.Parent then session.root:Destroy() end
end
Players.PlayerRemoving:Connect(clearSession)

local function makeAPI(player,session,id)
    local ALEX={}
    function ALEX.isActive() return session.active and player.Parent==Players end
    function ALEX.wait(seconds)
        if not ALEX.isActive() then return false end
        task.wait(math.clamp(tonumber(seconds) or 0.03,0.03,5))
        return ALEX.isActive()
    end
    function ALEX.track(instance)
        assert(typeof(instance)=="Instance","ALEX.track expects an Instance")
        table.insert(session.cleanups,function()
            if instance.Parent then instance:Destroy() end
        end)
        return instance
    end
    function ALEX.onCleanup(fn)
        assert(type(fn)=="function","ALEX.onCleanup expects a function")
        table.insert(session.cleanups,fn)
    end
    function ALEX.spawnPart(name,position)
        assert(ALEX.isActive(),"Session finished")
        local p=Instance.new("Part")
        p.Anchored=true
        p.CanCollide=false
        p.Material=Enum.Material.Neon
        p.Color=Color3.fromRGB(173,102,255)
        p.Size=Vector3.new(4,1,4)
        p.Name=tostring(name or "ALEX_TestPart"):sub(1,60)
        p.Position=typeof(position)=="Vector3" and position or Vector3.new(0,9,0)
        p.Parent=session.root
        return p
    end
    function ALEX.showForAll(text)
        assert(ALEX.isActive(),"Session finished")
        local ok,filtered=pcall(function()
            local result=TextService:FilterStringAsync(tostring(text):sub(1,120),player.UserId)
            return result:GetNonChatStringForBroadcastAsync()
        end)
        if not ok then error("Could not filter message") end
        remote:FireAllClients("broadcast",filtered)
    end
    function ALEX.log(...)
        local words={}
        for i=1,select("#",...) do table.insert(words,tostring(select(i,...))) end
        log(player,table.concat(words," "),id)
    end
    ALEX.owner=player
    ALEX.objects=session.root
    return ALEX
end

local function execute(player,id,code)
    if not authorized(player) then
        warn("[ALEX] Rejected unauthorized script from "..tostring(player.UserId))
        return
    end
    if typeof(id)~="number" or id~=math.floor(id) or id<0 then return end
    if type(code)~="string" or #code==0 or #code>MAX_SCRIPT_LENGTH then
        log(player,"Script must be between 1 and 16000 characters.",id)
        return
    end
    if not ServerScriptService.LoadStringEnabled then
        log(player,"Enable LoadString in Game Settings > Security (test place only).",id)
        return
    end
    local session=createSession(player)
    if session.running>=MAX_RUNNING_SCRIPTS then
        log(player,"Maximum running scripts reached.",id)
        return
    end
    if session.lastExecute>0 and os.clock()-session.lastExecute<EXECUTE_COOLDOWN then
        log(player,"Please wait for the 2-second cooldown.",id)
        return
    end
    session.lastExecute=os.clock()
    local chunk,compileError=loadstring(code,"ALEX_TestLab_Paste")
    if not chunk then
        log(player,"COMPILE ERROR: "..tostring(compileError),id)
        return
    end
    local ALEX=makeAPI(player,session,id)
    -- This is only an API convenience, NOT a secure sandbox.
    local env=setmetatable({
        ALEX=ALEX,
        print=function(...) ALEX.log(...) end,
        warn=function(...) ALEX.log("WARN:",...) end,
    },{__index=getfenv(chunk)})
    setfenv(chunk,env)
    session.running+=1
    local done=false
    local thread
    thread=task.spawn(function()
        log(player,"Executing server script (replicated changes visible to other players)...",id)
        local ok,result=pcall(chunk)
        done=true
        session.running=math.max(0,session.running-1)
        if thread then session.threads[thread]=nil end
        if ok then
            log(player,"DONE"..(result~=nil and " -> "..tostring(result) or ""),id)
        else
            log(player,"RUNTIME ERROR: "..tostring(result),id)
        end
    end)
    if not done then session.threads[thread]=true end
    task.delay(MAX_EXECUTION_SECONDS,function()
        if done or not session.active then return end
        if coroutine.status(thread)~="dead" and pcall(task.cancel,thread) then
            session.threads[thread]=nil
            session.running=math.max(0,session.running-1)
            log(player,"15s timeout. Untracked child tasks may still exist.",id)
        end
    end)
end

remote.OnServerEvent:Connect(function(player,action,id,code)
    if action=="hello" then
        reply(player,"welcome",{
            allowed=authorized(player),
            message=not isPrivate() and "Disabled in public servers." or
                (isOwner(player) and "Owner test console ready." or "Not an authorized test editor.")
        })
    elseif action=="execute" then
        execute(player,id,code)
    elseif action=="clear" and authorized(player) then
        clearSession(player)
        log(player,"Tracked test effects cleared.",id)
    end
end)
print("[ALEX TEST LAB] Owner-only test runner ready")
