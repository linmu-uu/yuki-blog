---
title: "游戏里官方支持的 Lua：Garry's Mod、Roblox、FiveM 模组入门"
published: 2026-09-22
description: "三个真正用 Lua 写模组/游戏的官方平台：GMod 的 hook 与 realm、Roblox 的 Luau 与 RemoteEvent、FiveM 的 fxmanifest 与事件系统。附最小可跑示例，以及各自最容易踩的坑。"
tags: [Lua, 游戏, 模组]
category: 学习笔记
draft: false
---

上一篇写了 [Lua 的八个坑](/posts/lua-pitfalls/)。这篇聊点好玩的：**哪些游戏是真的在用 Lua**。

答案是：远比想象中多。Lua 的解释器很小（几百 KB）、启动快、能把宿主程序的对象安全地暴露给脚本，
还天然适合做沙箱——所以游戏引擎特别爱把它嵌进去当脚本层。

下面挑三个「官方支持、社区成熟」的平台：**Garry's Mod**（工具沙盒）、**Roblox**（做游戏）、**FiveM**（GTA V 多人服）。
它们的共同点是：你写的东西是平台允许的，不用担心账号风险，也不需要碰任何注入工具。

## 先看全貌

| 对比项 | Garry's Mod | Roblox | FiveM |
| --- | --- | --- | --- |
| Lua 方言 | LuaJIT（5.1 语法 + 即时编译） | Luau（带类型标注的方言） | Lua 5.4 |
| 你在做什么 | 改别人的游戏模式 | 从零做一款游戏 | 搭 GTA V 的多人服务器 |
| 服务端 | `lua/autorun/server/` 等 | `ServerScriptService` | `server_script` |
| 客户端 | `lua/autorun/client/` 等 | `StarterPlayerScripts` 等 | `client_script` |
| 通信方式 | `net` 库 | `RemoteEvent` / `RemoteFunction` | `TriggerServerEvent` 等 |
| 发布 | Steam 创意工坊 | Roblox 平台一键发布 | 自己开服 / 上架框架 |

接下来按平台过一遍，每段都是「结构 → 最小示例 → 特有的坑」。

## 一、Garry's Mod：hook + realm

GMod 是 Source 引擎上的沙盒，写模组就是往 `garrysmod/addons/你的插件/lua/` 里丢文件。

### 目录结构决定"这段代码跑在哪"

```
addons/my_addon/lua/
├── autorun/            # 加载时自动执行
│   ├── sh_hello.lua    # 服务端和客户端都跑（shared）
│   ├── server/         # 只在服务端跑
│   └── client/         # 只在客户端跑
├── weapons/            # 武器（SWEP）
├── entities/           # 实体（ENT）
└── vgui/               # 界面
```

**这个划分是 GMod 最重要的概念**：一个 Lua 文件属于哪个 realm，决定了它能调用哪些 API。
在服务端文件里写 `LocalPlayer` 会直接报错，反过来在客户端里改 `player.GetAll()` 拿到的实体也改不动服务端状态。

### 最小示例

```lua
-- lua/autorun/server/hello_sv.lua
hook.Add("PlayerSpawn", "yuki_greet", function(ply)
    print(ply:Nick() .. " 出生了")
end)
```

```lua
-- lua/autorun/client/hello_cl.lua
hook.Add("HUDPaint", "yuki_hud", function()
    draw.SimpleText("Hello GMod", "DermaDefault", 20, 20)
end)
```

`hook.Add(事件名, 唯一标识, 回调)` 是 GMod 的骨架：引擎在各种时机广播事件，你的代码挂在上面就行。
常用事件有 `PlayerSpawn`、`PlayerDeath`、`Think`（每帧）、`HUDPaint`（每帧绘制 HUD）。

### 客户端和服务端怎么说话

GMod 用 `net` 库。**服务端必须先注册网络消息名**，否则客户端发过来会被丢掉：

```lua
-- lua/autorun/sh_net.lua（shared 文件，两边都加载）
if SERVER then
    util.AddNetworkString("yuki_hello")
end

-- 服务端：收到客户端消息，广播给所有人
net.Receive("yuki_hello", function(len, ply)
    net.Start("yuki_hello")
        net.WriteString(ply:Nick())
    net.Broadcast()
end)

-- 客户端：接收广播
net.Receive("yuki_hello", function()
    local name = net.ReadString()
    chat.AddText("[Yuki] ", name, " 打了个招呼")
end)
```

客户端要主动发就用：

```lua
net.Start("yuki_hello")
net.SendToServer()
```

写消息的顺序必须是**先写先读**，`WriteString` / `ReadString` 一旦对不上，整条消息就乱了——
这是新手最常见的"服务端收到了，但数据是乱的"。

### GMod 特有的坑

- **`SERVER` / `CLIENT` 只是两个布尔值**，用它们分支比拆文件省事，但别忘了 shared 文件里两边都会跑
- `Think` 是**每帧**调用的，里面塞循环和字符串拼接会直接掉帧
- 服务端没有 `draw`、客户端也没有 `ents.Create`，跨 realm 调用报错很常见
- 想在创意工坊发布，用游戏内的插件菜单发布，或者用 `gmpublish`，别手动传文件夹

## 二、Roblox：Luau + 远程事件

Roblox 严格说不算"模组"，而是**做自己的游戏**：引擎、服务器、商店都是平台提供的，你写代码把游戏搭出来。

### Luau 不是标准 Lua

Roblox 用的是 **Luau**，基于 Lua 5.1 改造，加了类型标注、`continue`、字符串插值、`task` 库等：

```lua
--!strict
local function greet(name: string): string
    return `你好，{name}！`        -- 字符串插值
end

task.delay(2, function()
    print("两秒后执行")             -- 取代老的 wait/spawn
end)

for i = 1, 5 do
    if i % 2 == 0 then continue end -- Luau 有 continue
    print(i)
end
```

### 代码放在哪，就是给谁跑的

| 位置 | 运行方 |
| --- | --- |
| `ServerScriptService` | 服务端（所有玩家共享一份世界） |
| `StarterPlayerScripts` | 客户端（每个玩家各跑一份） |
| `ReplicatedStorage` | 两边都能读的共享数据 / 远程事件 |

最小示例：

```lua
-- ServerScriptService/Hello.server.lua
local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
    print(player.Name .. " 加入了")

    player.CharacterAdded:Connect(function(character)
        local humanoid = character:WaitForChild("Humanoid")
        humanoid.WalkSpeed = 20
    end)
end)
```

客户端和服务端之间**不能直接互相调用**，必须通过 `RemoteEvent`（单向）或 `RemoteFunction`（有返回值）：

```lua
-- ReplicatedStorage 里先放一个 RemoteEvent，命名 SayHello

-- 服务端
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local sayHello = ReplicatedStorage:WaitForChild("SayHello")

sayHello.OnServerEvent:Connect(function(player, message)
    print(player.Name .. " 说：" .. tostring(message))
end)

-- 客户端
local sayHello = game:GetService("ReplicatedStorage"):WaitForChild("SayHello")
sayHello:FireServer("你好")
```

### Roblox 特有的坑

- **`OnServerEvent` 里的参数永远不可信**：客户端可以发任何东西。长度、类型、频率都要自己校验
- `LocalPlayer` 只在客户端存在，服务端访问会报错
- `wait()` / `spawn()` 是老的全局函数，现在用 `task.wait()` / `task.spawn()` / `task.defer()`
- 每帧逻辑要用 `RunService.Heartbeat`（或 `Stepped`），但别在里面做重活
- Luau **没有 `goto`**，从标准 Lua 抄代码时这点最容易踩

## 三、FiveM：fxmanifest + 事件

FiveM 是 GTA V 的多人平台，最典型的使用场景是 RP（角色扮演）服务器。
它的 Lua 运行环境比较新（5.4），语法上反而最接近标准 Lua。

### 一个资源（resource）长这样

```
resources/[local]/my_greeting/
├── fxmanifest.lua
├── client/main.lua
└── server/main.lua
```

```lua
-- fxmanifest.lua
fx_version 'cerulean'
game 'gta5'

client_script 'client/main.lua'
server_script 'server/main.lua'
```

写完在服务器的 `server.cfg` 里加一行 `ensure my_greeting` 就生效了。

### 最小示例：客户端请求，服务端回应

```lua
-- client/main.lua
RegisterCommand('greet', function()
    TriggerServerEvent('yuki:hello')
end, false)

RegisterNetEvent('yuki:reply', function(text)
    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandThefeedPostTicker(false, true)
end)
```

```lua
-- server/main.lua
RegisterNetEvent('yuki:hello', function()
    local src = source                    -- 事件里的 source 就是触发者的 ID
    local name = GetPlayerName(src)

    TriggerClientEvent('yuki:reply', src, ('你好，%s！'):format(name))
end)
```

要点：

- 客户端触发的事件，服务端**必须先用 `RegisterNetEvent` 注册**，否则会被忽略
- 客户端的 `RegisterCommand` 回调参数是 `(source, args, rawCommand)`；服务端的同名回调第一参数是玩家 ID
- `source` 是事件回调里的全局变量，代表"谁触发的"，**不是**你随便传的值

### 和游戏世界打交道：主线循环

```lua
-- client/main.lua
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(500)                       -- 别用 0，除非真的需要每帧
        local playerPed = PlayerPedId()
        local coords = GetEntityCoords(playerPed)
        -- 这里可以做点按时间轮询的事情
    end
end)
```

### FiveM 特有的坑

- `Wait(0)` 是每帧循环，写成 `Wait(0)` 又做重活，服务器/客户端都会卡
- **`RegisterNetEvent` 的处理函数必须校验参数**，任何客户端都能伪造事件（这是服务器被打穿的头号原因）
- 客户端和服务端的 API 不通用：`GetEntityCoords` 是客户端原生函数，服务端要用 `GetEntityCoords(GetPlayerPed(src))` 之类的服务端版本
- 框架（ESX / QBCore / ox_*）是社区约定，不是官方标准，抄代码前先看你的服务器用哪套

## 四、三个平台共同的坑

虽然方言和 API 都不一样，翻车点却高度一致：

**1. 跨 realm 调用**
GMod 的 shared 文件、Roblox 的 `ServerScriptService`、FiveM 的 client/server 脚本——先想清楚这段代码跑在哪，再写 API。

**2. 相信客户端**
Roblox 的 `OnServerEvent`、FiveM 的 `RegisterNetEvent`、GMod 的 `net.Receive`：
客户端发来的一切都是用户可控输入，长度、范围、频率全部要校验。

**3. 每帧回调里做重活**
GMod `hook.Add("Think", ...)`、Roblox `RunService.Heartbeat`、FiveM `Wait(0)` 循环——
每帧只做该做的事，能降频就降频，能用事件就别轮询。

**4. 忘了 `local`**
上一篇讲过的老问题，在这三个平台里代价更大：轻则变量互相覆盖，重则覆盖引擎注入的全局，出问题极难查。

**5. 方言差异**
从网上抄代码最容易踩的坑：

| 写法 | GMod(LuaJIT) | Roblox(Luau) | FiveM(5.4) |
| --- | --- | --- | --- |
| `5 // 2` | 不支持 | 支持 | 支持 |
| `math.type` | 没有 | 没有 | 有 |
| `continue` | 没有 | 有 | 没有 |
| `goto` | 有 | 没有 | 有 |
| 字符串插值 | 没有 | 有 | 没有 |
| 整数/浮点区分 | 没有（全是双精度） | 没有 | 有 |

同一段代码在这个平台能跑、换个平台就报错，多半就是这张表里的原因。

## 五、该从哪个开始

- **想快速看到效果**：Garry's Mod。装个插件丢进 `lua/` 就能跑，`hook.Add` + `net` 两套东西学会就能做不少东西
- **想做一款自己的游戏**：Roblox。平台把服务器、存档、支付都包了，Luau 的类型系统对新手也很友好
- **想折腾服务器 / 玩 RP 服**：FiveM。语法最接近标准 Lua，但要接触的生态（框架、数据库、原生函数）最多

三个平台的文档都很完整，而且都有大量开源插件可以拆着看——对学 Lua 来说，
「读别人写的模组」比刷教程有效得多。

下一篇打算写写 Lua 在正经工程里的用法（OpenResty、Redis 脚本、Neovim），
把"游戏里的 Lua"和"服务器上的 Lua"这条线连起来喵。
