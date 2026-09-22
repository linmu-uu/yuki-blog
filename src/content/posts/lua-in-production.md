---
title: "Lua 在正经工程里的用法：OpenResty、Redis 脚本、Neovim"
published: 2026-09-22
description: "Lua 不只活在游戏里。OpenResty 用它做网关的鉴权限流，Redis 用它把多条命令压成原子操作，Neovim 拿它当配置语言。三个场景的写法、套路，以及「千万别阻塞宿主」这条共同铁律。"
tags: [Lua, 工程实践, 后端]
category: 学习笔记
draft: false
---

前两篇写了 [Lua 的八个坑](/posts/lua-pitfalls/) 和 [游戏里的 Lua](/posts/lua-in-games/)。这篇换个方向：**服务器和编辑器里的 Lua**。

Lua 在这类场景里的角色其实很一致——宿主程序负责"能做什么"（网络、存储、UI），Lua 负责"什么时候做、怎么组合"。所以你会发现三个场景长得完全不一样，但思路是通的。

## 一、OpenResty：把 Nginx 变成可编程网关

OpenResty = Nginx + LuaJIT + 一堆精心写好的 Lua 库。它在 Nginx 的请求处理流程里插了几个钩子，让你用 Lua 来接管请求。

### 先记住"阶段"这个概念

Nginx 处理一个请求是有固定顺序的，OpenResty 把 Lua 挂在这些阶段上：

| 阶段 | 什么时候跑 | 典型用途 |
| --- | --- | --- |
| `init_by_lua` | master 启动时 | 加载配置、预编译正则 |
| `rewrite_by_lua` | 改写 URL 之前 | 重定向、灰度分流 |
| `access_by_lua` | 访问控制 | 鉴权、限流、黑名单 |
| `content_by_lua` | 生成响应 | 直接返回 JSON、编排上游 |
| `log_by_lua` | 请求结束后 | 打点、异步统计 |

**同一段代码放在不同阶段，能用的 API 和产生的效果完全不同**——这是 OpenResty 最容易绕晕的地方。比如 `ngx.say()` 只在 `content_by_lua` 里自然，放到 `access_by_lua` 里就会让人困惑。

### 最小示例：直接返回 JSON

```nginx
location /health {
    content_by_lua_block {
        ngx.header["Content-Type"] = "application/json"
        ngx.say('{"ok":true}')
    }
}
```

### 常用套路：access 阶段做鉴权

```nginx
location /api/ {
    access_by_lua_block {
        local token = ngx.req.get_headers()["authorization"]
        if not token or token == "" then
            ngx.exit(401)          -- access 阶段返回 401，请求不会再打到后端
        end

        -- 生产环境用 lua-resty-jwt 验签，这里只演示取头
        -- 验过之后把用户信息透给后端，后端就不用再解析一遍了
        ngx.req.set_header("X-User-Id", "u_123")
    }

    proxy_pass http://backend;
}
```

### 常用套路：共享内存做限流

```nginx
lua_shared_dict limit 10m;      # 所有 worker 共享的一块内存

server {
    location /api/ {
        access_by_lua_block {
            local dict = ngx.shared.limit
            local key = ngx.var.binary_remote_addr      -- 访客 IP

            -- incr(key, 增量, 初始值, 初始过期秒数)：不存在就按初始值建，原子操作
            local count = dict:incr(key, 1, 0, 60)

            if count > 100 then
                ngx.log(ngx.WARN, "rate limited: ", key)
                ngx.exit(429)
            end
        }

        proxy_pass http://backend;
    }
}
```

`lua_shared_dict` 是**跨 worker 共享**的，所以单机限流不用自己搞分布式计数；要多机限流才需要 Redis。

### OpenResty 特有的坑

- **任何阻塞调用都会拖住整个 worker**：`os.execute`、阻塞式 socket、大文件读写都不行。要联网用 `ngx.socket.tcp`（cosocket，非阻塞），要跑耗时任务用 `ngx.timer.at`。
- 跑的是 **LuaJIT（5.1 语法）**：没有整数/浮点区分，也没有 `math.type`，从 5.4 抄代码会报错。
- `log_by_lua` 是同步执行的，别在里面做重活，否则每个请求的收尾都被拖慢。
- 开发时用 `lua_code_cache off` 方便改代码，**上线必须打开**，否则每个请求都重新加载模块，性能会雪崩。

## 二、Redis 脚本：把"多条命令"压成"一个原子操作"

Redis 的 Lua 脚本解决的是一个很具体的问题：**多条命令之间的竞态**。

比如"读计数、判断、自增"，用客户端写是三个往返、中间可能被别的请求插队；写成一段 Lua，Redis 会**整段原子执行**（单线程执行脚本，中途不处理其他命令）。

### 基本形态

```bash
EVAL "return redis.call('SET', KEYS[1], ARGV[1])" 1 mykey hello
```

- `KEYS` 放键，`ARGV` 放参数，中间那个数字是"有几个键"。
- **所有键都必须从 `KEYS` 传进来**，不要在脚本里硬写。集群模式下 Redis 需要靠这些键来路由和校验。
- `redis.call` 出错会抛异常中断脚本，`redis.pcall` 则把错误当成返回值给你。

### 常用套路一：限流

```lua
-- KEYS[1] = 限流键（如 rate:user:123）
-- ARGV[1] = 窗口秒数，ARGV[2] = 窗口内上限
local current = redis.call('INCR', KEYS[1])

if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])   -- 第一次访问时设置过期
end

if current > tonumber(ARGV[2]) then
  return 0
end

return 1
```

`INCR` 和 `EXPIRE` 如果分开写，就会出现"计数加了但过期没设上"的漏网之鱼；放进脚本里就稳了。

### 常用套路二：安全地释放分布式锁

```lua
-- KEYS[1] = 锁的键，ARGV[1] = 自己持有的随机值
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

先比对再删除，避免"锁超时后误删别人的锁"——这是分布式锁最经典的坑。

### 常用套路三：扣库存

```lua
-- KEYS[1] = 库存键，ARGV[1] = 要扣多少
local stock = tonumber(redis.call('GET', KEYS[1]))

if not stock or stock < tonumber(ARGV[1]) then
  return -1          -- 库存不足
end

redis.call('DECRBY', KEYS[1], ARGV[1])
return stock - tonumber(ARGV[1])
```

### 返回值是怎么转换的

| Lua 返回 | Redis 返回 |
| --- | --- |
| `number` | 整数（**小数会被截断**） |
| `string` | 字符串 |
| `table` | 数组（遇到 `nil` 截断） |
| `true` / `false` | 1 / nil |
| `nil` | nil |

「小数被截断」是最容易踩的：想返回浮点，要么自己 `tostring` 成字符串，要么返回分子分母让客户端算。

### Redis 脚本特有的坑

- **脚本是阻塞的**：Redis 主线程执行脚本期间不处理其他命令。要等超过 `lua-time-limit`（默认 5 秒）才允许 `SCRIPT KILL`，所以脚本必须短小，别在里面循环几万次。
- 集群模式下，脚本碰到的所有键必须在同一个 slot，跨 slot 会直接报错；用 `{}` 哈希标签把相关的键拉到一起。
- 线上一般不用裸 `EVAL`：先 `SCRIPT LOAD` 拿到 sha1，之后用 `EVALSHA` 调用以减少重复传输；遇到 `NOSCRIPT` 错误再回退到 `EVAL`。
- `SCRIPT FLUSH` 或重启会清掉脚本缓存，所以上面的回退逻辑不能省。

## 三、Neovim：拿 Lua 当配置语言

Neovim 从 0.5 开始内嵌 LuaJIT，`init.lua` 逐渐取代了 `init.vim`。它不只是让你"配置"编辑器，还能直接写插件。

### 最小示例：一份 init.lua

```lua
-- 先把 leader 定下来，一定要放在快捷键之前
vim.g.mapleader = " "

vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.expandtab = true
vim.opt.shiftwidth = 2
vim.opt.termguicolors = true

vim.keymap.set("n", "<leader>w", ":write<CR>", { desc = "保存" })
vim.keymap.set("n", "<leader>q", ":quit<CR>", { desc = "退出" })
```

几组 API 的分工很清晰：

| 写法 | 作用 |
| --- | --- |
| `vim.o` / `vim.bo` / `vim.wo` | 全局 / 缓冲区 / 窗口选项 |
| `vim.g` | 全局变量（插件之间约定的配置入口） |
| `vim.keymap.set()` | 快捷键，比 `vim.api.nvim_set_keymap` 好用得多 |
| `vim.fn.*` | 调用 Vimscript 函数，比如 `vim.fn.expand("%")` |
| `vim.cmd[[...]]` | 执行 ex 命令，迁移老配置时很方便 |

### 自动命令和自定义命令

```lua
-- 保存 .lua 文件时自动格式化（需要配好支持格式化的 LSP）
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = { "*.lua" },
  callback = function()
    vim.lsp.buf.format({ async = false })
  end,
})

-- 自定义命令：:Hello 或者 :Hello 世界
vim.api.nvim_create_user_command("Hello", function(opts)
  local who = opts.args ~= "" and opts.args or "世界"
  print("你好，" .. who)
end, { nargs = "?" })
```

### 写自己的模块

Neovim 会把 `lua/` 目录加进模块搜索路径，所以：

```
~/.config/nvim/lua/yuki/init.lua   ->   require("yuki")
~/.config/nvim/lua/yuki/util.lua   ->   require("yuki.util")
```

```lua
-- lua/yuki/util.lua
local M = {}

function M.greet(name)
  print("你好，" .. name)
end

return M
```

```lua
-- init.lua
require("yuki.util").greet("Yuki")
```

### Neovim 配置特有的坑

- **配置报错会中断整个 `init.lua`**，后面的配置全部不生效，还很安静。引入可选模块时用 `pcall` 兜一下：

```lua
local ok, err = pcall(require, "yuki.optional")
if not ok then
  vim.notify("可选模块加载失败：" .. err, vim.log.levels.WARN)
end
```

- `vim.g` 和 `vim.o` 别混：`vim.g.mapleader` 是变量，`vim.opt.*` 才是选项。
- `require` 有缓存，改了模块想热重载得手动清：`package.loaded["yuki.util"] = nil`。
- 启动速度：几十个插件全在启动时加载会明显变慢，用 lazy.nvim 这类管理器按事件懒加载。
- 还是那句：跑的是 **LuaJIT（5.1 语法）**，没有整数类型。

## 四、三个场景的共同点

写下来会发现，这三个宿主对你的要求惊人地一致：

**1. 都怕阻塞。** OpenResty 里阻塞会卡住 worker，Redis 里阻塞会卡住整个实例（它是单线程），Neovim 里阻塞会卡住 UI。所以「用非阻塞 API」「脚本要短」「别在回调里做重活」是通用规律。

**2. 都是方言。** LuaJIT（OpenResty / Neovim）是 5.1 语法，Redis 的内置 Lua 也是 5.1 系（部分发行版开始支持更新的脚本环境），跟标准 Lua 5.4 都有差异。跨环境抄代码，先看版本。

**3. 都是"胶水层"。** 真正干活的是宿主（Nginx 的网络、Redis 的数据结构、Neovim 的编辑能力），Lua 负责在合适的时机把它们串起来——这也是 Lua 被嵌进各种软件的根本原因。

**4. 都能就地试。**

- OpenResty：`resty -e 'print(ngx.var.host)'` 起一个带 `ngx` 的交互环境
- Redis：`redis-cli EVAL "return 1" 0` 直接试
- Neovim：`:lua print(vim.inspect(vim.opt.number:get()))` 随时验证

学 Lua 最有性价比的方式，大概就是挑一个自己每天在用的宿主，用它写点真东西。

## 小结

| 场景 | Lua 的角色 | 一句话记住 |
| --- | --- | --- |
| OpenResty | 请求管线里的策略层 | 分阶段挂代码，别阻塞 worker |
| Redis | 原子操作封装 | 键走 `KEYS`，脚本要短 |
| Neovim | 配置与插件语言 | 用 `pcall` 保护配置，注意 5.1 方言 |

到这里，「Lua 是什么」「哪里在用」「工程里怎么用」这三篇就串成一条线了。

下一篇打算写点动手的：用 Lua 给博客做个小工具（比如把 Markdown 文章批量转成主题需要的格式），顺便聊聊 Lua 的字符串处理库怎么挑喵。
