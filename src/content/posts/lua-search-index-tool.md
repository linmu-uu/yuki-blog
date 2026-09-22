---
title: "用 Lua 给博客写个小工具：批量生成站内搜索索引"
published: 2026-09-22
description: "博客一直没有搜索。与其接一个搜索服务，不如用 Lua 写个七十行的小工具：扫 Markdown、解析 front-matter、去掉标记、吐出一份 JSON 索引，顺手把踩到的两个 Lua 坑讲清楚。"
tags: [Lua, 建站, 工程实践]
category: 建站笔记
draft: false
---

博客上线到现在，一直缺个东西：**搜索**。

站内文章慢慢多起来以后，想找之前写过的东西只能靠翻归档。接一个搜索服务吧，为了六篇文章不值当；
上 Algolia、Meilisearch 之类又要多一个服务、多一份维护。

最后决定：**自己写个小工具，把文章压成一份 JSON 索引，前端拿它做纯静态搜索。**
而用来写这个工具的语言，正好是前面几篇的主角——Lua。

## 为什么是 Lua

这个任务的需求很朴素：读一堆文件、切字符串、拼 JSON、写文件。

放在 Lua 里，它大概七十行；放在别的语言里也能写，只是 Lua 有两个额外好处：

- 前面三篇刚聊完，正好练手；Lua 的 `gsub` + 模式匹配处理文本特别顺手
- 它本来就是「宿主负责 IO，Lua 负责编排」的定位，这个工具就是标准的胶水脚本

当然也有短板，而且马上就遇到了：

**Lua 标准库没有列目录、没有 JSON**。前者得借 shell，后者只能手写（顺便把 JSON 转义规则学明白）。

## 第 0 步：装一个 Lua

Windows 上最省事的是 winget：

```powershell
winget install --id DEVCOM.Lua
```

装完**记得重开终端**（PATH 是安装时写进环境变量的，老终端读不到），然后：

```bash
lua -v
# Lua 5.4.6  Copyright (C) 1994-2023 Lua.org, PUC-Rio
```

如果你用 scoop，`scoop install lua` 也一样——不过 scoop 要拉 GitHub 的 bucket，
网络不通的话还是 winget 稳一点。

## 工具要做四件事

1. **列出所有文章** —— `src/content/posts/*.md`
2. **解析 front-matter** —— 拿标题、日期、标签、简介
3. **把 Markdown 洗成纯文本** —— 搜索不需要代码块和语法符号
4. **输出 JSON** —— 给前端用的索引

下面按顺序说，代码在 `tools/build-search-index.lua`。

### 一、列目录：标准库不给，就借 shell

```lua
local function list_markdown_files(dir)
	local is_windows = package.config:sub(1, 1) == "\\"   -- 判断路径分隔符
	local command

	if is_windows then
		command = string.format('dir /b "%s\\*.md"', dir)
	else
		command = string.format("ls -1 '%s'/*.md 2>/dev/null", dir)
	end

	local files = {}
	local pipe = io.popen(command)
	if not pipe then return files end

	for line in pipe:lines() do
		line = line:gsub("%s+$", "")
		if line ~= "" then
			table.insert(files, dir .. "/" .. line)
		end
	end
	pipe:close()

	table.sort(files)
	return files
end
```

`io.popen` 会开一个子进程执行命令，然后你可以像读文件一样读它的输出。
两行里需要注意的：

- `package.config:sub(1, 1)` 就是路径分隔符，Windows 上是 `\`、其它平台是 `/`，常用来做平台分支
- `ls` 后面加了 `2>/dev/null`，目录不存在时不要刷一堆错误上来

想要更干净的做法，可以装 **LuaFileSystem**（`lfs.dir`），只是这个工具就为了列个目录，
借 shell 更划算。要是你的工具会被别人拿到不同系统上跑，请务必装 lfs。

### 二、解析 front-matter

文章的头部长这样：

```yaml
---
title: "用 Lua 给博客写个小工具"
published: 2026-09-22
tags: [Lua, 建站]
---
```

解析它不需要完整的 YAML 库，逐行切一刀就够：

```lua
local function parse_front_matter(text)
	local meta = {}
	local head, body = text:match("^%-%-%-\r?\n(.-)\r?\n%-%-%-\r?\n(.*)$")

	if not head then
		return meta, text
	end

	for line in head:gmatch("[^\r\n]+") do
		local key, value = line:match("^([%w_%-]+):%s*(.-)%s*$")
		if key then meta[key] = value end
	end

	return meta, body
end
```

两个细节：

- `%-%-%-` 就是三个连字符。Lua 的模式里 `-` 是特殊字符（非贪婪量词），要加 `%` 转义
- 行尾用了 `?` 处理 CRLF：`\r?\n`，Windows 上写文件很容易带着 `\r`

### 三、去掉 Markdown 标记

搜索索引不需要 `##`、`**`、`[]()` 这些符号。这里用一个小状态机，遇到代码围栏就整段跳过：

```lua
local function strip_markdown(text)
	local lines = {}
	local in_code = false

	for line in text:gmatch("[^\r\n]+") do
		if line:match("^%s*```") then
			in_code = not in_code            -- 代码块内容不参与搜索
		elseif not in_code then
			line = line:gsub("^%s*#+%s*", "")                     -- 标题
			line = line:gsub("^%s*[%-%*%+]%s+", "")               -- 无序列表
			line = line:gsub("!%[[^%]]*%]%([^%)]*%)", " ")        -- 图片
			line = line:gsub("%[([^%]]*)%]%([^%)]*%)", "%1")      -- 链接只留文字
			line = line:gsub("[%*_`]", "")                        -- 强调符号
			if line:match("%S") then table.insert(lines, line) end
		end
	end

	return table.concat(lines, " ")
end
```

重点看链接那条：`%[([^%]]*)%]%([^%)]*%)` 匹配 `[文字](地址)`，
其中 `%1` 是第一个捕获（文字部分），所以替换成 `%1` 就等于"只留文字"。

### 四、手写 JSON：转义是唯一容易翻车的地方

标准库没有 `json.encode`，但这点结构手写完全够用。**唯一不能马虎的是转义**：

```lua
local ESCAPES = {
	['"'] = '\\"',
	["\\"] = "\\\\",
	["\b"] = "\\b",
	["\f"] = "\\f",
	["\n"] = "\\n",
	["\r"] = "\\r",
	["\t"] = "\\t",
}

local function json_escape(text)
	return (text:gsub('[%c"\\]', function(char)
		return ESCAPES[char] or string.format("\\u%04x", char:byte())
	end))
end
```

`[%c"\\]` 一次匹配三类字符：控制字符（`%c`）、双引号、反斜杠。
常见的转义查表，查不到的控制字符统一写成 `\u00xx`。

> 外面那对括号 `(...)` 不是装饰：`gsub` 返回两个值（新字符串 + 替换次数），
> 套一层括号就只留第一个。这个坑下面马上还会遇到一次。

## 真正的坑：两个 Lua 特性

工具第一次跑起来，输出是这样的：

```json
"description": "\"",
"tags": ["Lua", "�", "�程", "踩坑"],
```

描述变成了一个孤零零的引号，标签里的"编程"被切成了两半。两个 bug，都是 Lua 的经典特性：

### 坑一：`match` 有多个捕获时，返回多个值

我写的是：

```lua
-- 想剥掉最外层的引号
local quoted = value:match("^%s*([\"'])(.-)%1%s*$")
```

这个模式有**两个捕获**：`([\"'])` 是引号本身，`(.-)` 才是里面的内容。
`string.match` 会把两个捕获都返回，而赋值给一个变量时只拿到**第一个**——于是 `quoted` 拿到的是那个引号。

改成接住第二个值就好：

```lua
local _, inner = value:match("^%s*([\"'])(.-)%1%s*$")
if inner then return inner end
```

> 顺带一提，`%1` 是反向引用，指"和第一个捕获一样的内容"，
> 所以这个模式能保证首尾用的是**同一种**引号。

### 坑二：Lua 的字符类是"按字节"的

分割标签我一开始写：

```lua
for tag in value:gmatch("[^,，]+") do   -- 想同时按半角和全角逗号切
```

结果"编程"被切碎。原因是 **Lua 的模式匹配是字节级的**：
全角逗号"`，`"在 UTF-8 里是三个字节 `EF BC 8C`，写进 `[^...]` 之后，
这三个字节**各自都成了分隔符**，而"编"（`E7 BC 96`）里恰好含 `BC`，于是被从中间切开。

正确做法是先把全角转半角，字符类里只留 ASCII：

```lua
value = value:gsub("，", ",")
for tag in value:gsub("%[", ""):gsub("%]", ""):gmatch("[^,]+") do
	...
end
```

这条经验可以推广成一句话：**Lua 的模式里不要放多字节字符，尤其是字符类里。**
（真要做 Unicode 感知的处理，就得上 `utf8` 库或者第三方的 Lua-UTF8 库。）

## 接到博客上

索引生成到 `public/search-index.json`，结构是：

```json
{
  "count": 6,
  "posts": [
    {
      "title": "Lua 入门：新手最容易踩的八个坑",
      "url": "/posts/lua-pitfalls/",
      "date": "2026-09-22",
      "category": "学习笔记",
      "tags": ["Lua", "编程", "踩坑"],
      "chars": 3443,
      "text": "Lua 是一门很小、很快……"
    }
  ]
}
```

前端再加一个 `/search` 页面就齐活了，逻辑很朴素：

- 关键词按空格拆开，**每个词都必须命中**（这样多词查询会收敛而不是发散）
- 打分权重：标题 6 分、标签 4 分、简介 2 分、正文 1 分
- 命中的关键词包成 `<mark>` 高亮（先 `escapeHtml` 再插标签，避免把用户输入当 HTML）
- 正文只截取关键词附近的一段，比展示开头更实用

打开 https://yuki666.online/search 就能看到，顶部导航也加了一项「搜索」。
顺手还做了两个小交互：按 `/` 或 `Ctrl+K` 直接聚焦输入框。

实测：

| 查询 | 结果 |
| --- | --- |
| `Lua` | 3 篇（三篇 Lua 文章） |
| `Cloudflare 部署` | 1 篇（"把静态博客部署到 Cloudflare"） |
| `Firefly 主题` | 1 篇 |
| 乱敲一串 | 0 篇 + 友好提示 |

## 什么时候别用 Lua

写完这个工具，也想聊点"什么时候不该用它"：

- **需要跨平台运行**：`io.popen("dir")` 只能在 Windows 跑，要跨平台就得引 lfs，那还不如直接 Node/Python
- **要进 CI、给团队用**：得先让构建环境装 Lua，多一个前置依赖就多一份故障点。
  这个索引我是在本地生成后**跟着仓库一起提交**的，所以线上构建仍然只需要 Node
- **逻辑复杂到几十个文件**：Lua 的短板（没有类库生态、模式匹配不是正则）会开始咬人

它最舒服的位置是：**几十到一两百行、自己用、跑一次就完事的小脚本**。
比如批量改 front-matter、统计字数、给文章生成摘要、把数据从一种格式倒成另一种。

## 小结

这个工具的完整代码在仓库的 `tools/build-search-index.lua`，跑法是：

```bash
lua tools/build-search-index.lua     # 或者 npm run search:index
```

写完之后最大的收获不是"博客有搜索了"，而是又亲手撞了一次 Lua 的两个特性：
**多返回值**和**字节级模式匹配**。书上看到是一回事，被它咬一口才真的记住。

博客现在有搜索、有动态、有评论、有相册，这套小窝总算齐了。下一篇打算写写这套静态站点背后的
Cloudflare Workers 是怎么把静态资源和几个后端接口串起来的喵。
