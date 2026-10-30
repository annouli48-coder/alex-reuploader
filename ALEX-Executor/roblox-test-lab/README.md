# ALEX Creator Test Lab V1 — real Luau execution in your game

**Working architecture:** The ALEX in-game console sends pasted Luau from the owner's Roblox client to a server-side loadstring runner inside a separate test place. That runner can create server effects which replicate to **all players in the same server**. The responsive interface works in the official Roblox app on Mac, Windows, iPhone, iPad, Android, and tablets. There is no key.

**This is not a native injector.** It cannot attach to Roblox Player processes or inject into unrelated games. Client-origin code changes don't automatically replicate to other clients. Server effects do.

## Install in your own Roblox Studio test place

1. In ServerScriptService, create a normal Script named ALEX_TestLab_Server. Paste the complete content of ALEX_TestLab_Server.server.luau.
2. In StarterPlayer > StarterPlayerScripts, create a LocalScript named ALEX_TestLab_Client. Paste the complete content of ALEX_TestLab_Client.client.luau.
3. In Game Settings > Security, turn Enable Loadstring ON for this **separate testing place only**. Roblox has it off by default due to the risk of arbitrary server code execution.
4. The server already recognizes creator IDs 9140908042 and 10290256654, but it also verifies that the user owns the user-owned place. For group-owned places, deliberately add that game's PlaceId to GROUP_OWNED_TEST_PLACE_IDS.
5. Press Play or use Studio Test > Start Server + 2 Players. The authorized account sees ALEX ✦. Paste custom Luau, then press EXECUTE.
6. For tests on real phones/tablets, publish a separate test place, access it in a **private or reserved server**, and use the official Roblox app. Public servers are intentionally blocked.

## Example — server-visible part for everyone

    local part = ALEX.spawnPart("ALEX_TEST", Vector3.new(0, 12, 0))
    part.Size = Vector3.new(7, 7, 7)
    ALEX.showForAll("ALEX server test is live!")
    print("ALEX cube created for everybody")

The ALEX API includes spawnPart(name, position), showForAll(text), track(instance), onCleanup(callback), isActive(), wait(seconds), objects (session folder), and log(...). Text broadcast is filtered by Roblox TextService.

## Cleanup limitations

The session folder and tracked objects are removed on CLEAR TESTS or owner departure. **Arbitrary pasted code cannot be automatically undone.** Directly modifying or destroying existing objects, independent spawned tasks, DataStore operations and external side effects might persist after leaving. Only run trusted scripts in disposable test places and private servers.

The server enforces UserId authorization, place ownership, private/Studio context, 16k input limit, 2-second cooldown, at most 5 running scripts, and best-effort 15-second cancellation. This does NOT constitute a secure Lua sandbox.

This implementation was statically reviewed, but not verified inside live Roblox or real phones yet.

Roblox official docs:
- https://devforum.roblox.com/t/an-update-on-automated-action-against-modified-clients/3640609/1
- https://create.roblox.com/docs/reference/engine/classes/ServerScriptService/LoadStringEnabled
- https://create.roblox.com/docs/projects/client-server
