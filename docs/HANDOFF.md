# 交接文档（HANDOFF）

> 用途：这是一个长期在做的个人博客项目。**新开一个 Codex 任务时，让助手先读这份文档**，
> 就能立刻接上进度，不用把之前几万字的对话重新搬一遍。
>
> 最后更新：2026-09-24（第四轮：4 张 AI 原创壁纸接入轮换并上线；上一轮是《SEO 基建》文章 + 音频瘦身 + 孤儿图清理）

## 一、项目地图

| 位置 | 是什么 | 线上地址 | 部署方式 |
| --- | --- | --- | --- |
| `C:\Users\ROG\Desktop\yuki-theme` | **主站**（Astro 6 + 自制蔚蓝档案风主题），有 git 仓库 | https://yuki666.online | `npm run deploy` |
| `C:\Users\ROG\Desktop\yuki-moments` | 「动态」后端（Worker + D1，含配图存取） | https://moments.yuki666.online | `npx wrangler deploy` |
| `C:\Users\ROG\Desktop\twikoo-cloudflare` | 评论后端（Twikoo） | https://twikoo.yuki666.online | `npx wrangler deploy` |
| `C:\Users\ROG\Desktop\yuki-music` | 音乐接口（代理网易云歌单），有 git 仓库 | https://music.yuki666.online | `npx wrangler deploy` |
| `D:\New` | 助手人格设定（喵酱）所在目录 | — | — |
| `C:\Users\ROG\.codex\visualizations\2026\09\20\01a0c015-1b7b-7cc2-97e6-d78c9dbab1bb` | 这段时间的截图与验证证据 | — | — |

所有 Worker 都跑在同一个 Cloudflare 账号下，每个后端一个子域名，主站是纯静态资源 Worker（名字沿用老站的 `firefly`）。

## 二、当前状态快照（2026-09-24）

- 主站：**11 篇文章**、搜索索引 54634 字；构建 **21 个页面**约 1.5 秒；工作区干净
- 主站线上版本：`de9e7ba0-08f5-480b-b7e0-e9573f630670`（Worker 名 `firefly`；第四轮部署两次：先上壁纸，后上新文章）
- 壁纸轮换：`ba-*` 10 张 + **`ai-*` 4 张**（白子雨夜 / 优香教室 / 星野黄昏 / 三一教堂），桌面 2560 与 1600 两档、手机 1080×1920
- 线上抽查：真机 Chromium 开首页 12 次，命中 `ai-desktop-03/04` 共 3 次，主题色随壁纸变化正常
- 音乐接口线上版本：`b5196ea7-5a41-4b10-b5a3-10f1070a7e39`
- 最近提交：见 `git log`（本轮：新文章 + 音频压缩 + Lua 5.5 兼容修复）
- 主要功能：首页（壁纸轮换 + 跟随壁纸变色）、文章、动态、相册、友链、留言、关于、**搜索**、发布后台 `/admin`、
  **RSS 订阅 `/rss.xml`**、**站点地图 `/sitemap.xml`**、`robots.txt`、**自定义 404 页**
- 首页资料卡的「文章 / 标签」数现在是读内容集合实时算的（以前写死在 `src/data/site.ts`，发到第 9 篇还显示 3）
- `bgm.mp3` 已重压：原来是 **WAV 容器里包着 192kbps MP3**（扩展名与内容不符），现在是真正的 MP3 / 102kbps，
  936,680 → 497,108 字节（-47%），时长 39.02s 不变；原文件在 git 历史里，`git show 54ae552:public/audio/bgm.mp3` 可还原
- 动态 D1 里 3 张孤儿配图（id 3/4/6，HANDOFF 之前记成 2 张）已删除并备份到本会话证据目录，
  数据库从 339,968 字节缩到 28,672 字节

## 三、常用命令

在主站 `yuki-theme` 目录下：

```bash
npm run dev              # 本地开发 http://127.0.0.1:4321
npm run build            # 构建到 dist/
npm run deploy           # 构建 + 部署到 Cloudflare（线上生效）

npm run search:index     # 用 Lua 重新生成站内搜索索引（加完文章要跑）
npm run wallpapers:import    # 从 D:\wallpapers 导入壁纸（压成 AVIF）
npm run wallpapers:ai        # 把 output/imagegen/*.png（AI 出图）接进轮换：2560 桌面 + 1600 小图 + 1080×1920 竖版
npm run wallpapers:palette   # 重新提取壁纸配色
npm run wallpapers:variants  # 生成 1600px 壁纸小图
npm run gallery:thumbs       # 生成相册缩略图
```

后端项目里：

```bash
npx wrangler deploy                 # 部署
npx wrangler tail                   # 实时看日志
npx wrangler deployments list --name <worker>   # 看历史版本（回滚用）
npx wrangler secret put <NAME>      # 设置密钥
npx wrangler dev --remote           # 本地直连线上资源调试（注意是真实数据）
```

## 四、关键配置在哪

| 想改什么 | 去哪改 |
| --- | --- |
| 站点标题、导航、社交链接、音乐接口地址 | `src/data/site.ts` |
| 壁纸白名单（哪些前缀进轮换） | `src/data/background.ts` 的 `ALLOWED_PREFIXES` |
| 缓存策略（HTML / 图片 / 索引） | `public/_headers` |
| 文章字段校验 | `src/content.config.ts` |
| 部署配置（Worker 名、静态资源目录） | `wrangler.toml` |
| 首页布局（三栏：左小组件 / 中文章 / 右日历） | `src/pages/index.astro` |
| RSS 全文订阅源 | `src/pages/rss.xml.ts`（新文章自动进源，不用改） |
| 站点地图 | `src/pages/sitemap.xml.ts`（固定页那份列表要手动维护） |
| 爬虫规则 | `public/robots.txt` |
| 404 页 | `src/pages/404.astro` + `wrangler.toml` 的 `not_found_handling` |
| 分享卡片 meta（og / twitter） | `src/layouts/BaseLayout.astro`（`image` / `type` / `canonical` 三个 props） |

## 五、踩过的坑（改代码前先看这一节）

**1. Cloudflare `_headers` 是「合并」不是「覆盖」，通配符还不跨 `/`。**
多条规则命中会叠加（`/gallery/` 上曾同时出现两个 `max-age`），而 `*` 不能跨路径分隔符。
所以资源规则和 HTML 规则要分开写，相册图片宁可逐个目录写 `/gallery/blue-archive/*`。

**2. HTML 必须允许「先用缓存」。**
HTML 现在是 `max-age=0, stale-while-revalidate=120`。这样预取下来的页面才能被复用；
没有 `stale-while-revalidate` 的话，切栏目时路由还会重新发一次跨境请求。

**3. 国内网络下要自己预取。**
`src/scripts/prefetch.ts` 是自研的：页面 load 后主动 fetch 站内页面。
Astro 自带的预取是低优先级的 `<link rel="prefetch">`，国内网络下浏览器常压着不发（实测 4 秒无请求）。

**4. Astro 的 scoped 样式 + `innerHTML` 会打架。**
用 JS 的 `innerHTML` 重绘节点后，`data-astro-cid-*` 属性会丢失，**整块样式失效**。
动态页和发布页都有 `applyScope()` 在重绘后补回属性，改这两处时别删。

**5. D1 读出来的 BLOB 是「数字数组」。**
不是 ArrayBuffer，直接 `new Response(row.data)` 会返回空 body（症状：接口 200 但 body 0 字节）。
`yuki-moments` 里有 `toBytes()` 负责转成 `Uint8Array`。

**6. Workers 静态资源不支持 Range。**
音频拖进度条会从头开始（本地预览却正常）。代码修不了，前端做了提示。

**7. YAML 的 `#` 是注释。**
文章 front-matter 里 `description` 如果含 `#` 或 `:`，**必须加引号**，否则会被截断（真实踩过）。

**8. Lua 的两个坑（写搜索工具时踩的）。**
`string.match` 有多个捕获时返回多个值，`local x = s:match("(a)(b)")` 只拿到第一个；
Lua 的字符类按字节匹配，`[^,，]` 会把全角逗号的字节也当成分隔符，中文会被切碎。

**9. 视图过渡 + 双层淡入 = 看着迟钝。**
切页时不要同时开「视图过渡淡入」和「`[data-reveal]` 逐项淡入」；动效只用透明度，
全屏 `scale` 要重采样、最容易显得僵硬。

**10. 静态端点里写的响应头没用。**
`rss.xml.ts` 里 `new Response(xml, { headers: { "Content-Type": ... } })` 在静态输出下会被
写成文件，线上由 Cloudflare 静态资源按扩展名定类型（`.xml` → `application/xml`），自己那行作废。
缓存策略要去 `public/_headers` 配，别在端点里写。

**11. 视图过渡会拦截「非 HTML 链接」。**
页脚指向 `/rss.xml`、`/sitemap.xml` 的链接必须加 `data-astro-reload`，否则 ClientRouter
会把 XML 当页面抓回来往 DOM 里塞；再加 `data-astro-prefetch="false"` 免得白预取一份订阅源。

**12. 404 页要显式打开。**
Workers 静态资源默认 `not_found_handling = "none"`：建了 `dist/404.html` 也不会被用，
用户看到的是 Cloudflare 自带白板。设成 `"404-page"` 才会返回自己的 404（状态码仍是 404）。

**13. 竖版壁纸别信 sharp 的自动重心。**
AI 图转 1080×1920 手机版时，`position: sharp.strategy.attention` 会被霓虹灯牌、大片天空带偏：
白子那张只剩一只手、星野那张整张都是天空。`scripts/prepare-ai-wallpapers.mjs` 里的 `FOCAL_X`
是逐张手填的焦点横向位置（0=最左，1=最右），换图后**必须自己看一眼竖版再发**。

**14. secret 别用管道喂，末尾换行会变成值的一部分。**
`Get-Clipboard | npx wrangler secret put NETEASE_COOKIE` 这种写法会把换行一起存进去，
Worker 里 `fetch` 上游立刻抛 `TypeError: Invalid header value.`。症状很阴：`/playlist` 因为命中边缘缓存
看着完全正常，只有 `/url` 全 500。正确做法是净化后走 `wrangler secret bulk` 传 JSON 文件，
顺手去掉 `cookie:` 前缀、按 `;` 拆字段去重，并确认只剩 ASCII 可见字符（`^[\x20-\x7E]+$`）。
排查手段：`npx wrangler tail yuki-music`（注意是位置参数，不是 `--name`）能看到完整异常栈。

## 六、待办 / 已知问题

- [x] `yuki-moments` 已 `git init` 并提交首次快照（commit `2abb539`，.gitignore 已排除 node_modules/.wrangler/.dev.vars）
- [x] `twikoo-cloudflare` 的配置改动已确认提交（commit `1185fee`：自定义域名 + 本站 D1）
- [x] 音频 `bgm.mp3` 已压到 102kbps（497KB，原来 936KB）
- [x] 动态里的孤儿配图已清理（实际 3 张）
- [ ] 加完文章记得跑 `npm run search:index`（RSS / 站点地图是构建时自动生成的，不用管）
- [x] 音乐 cookie 已配好（2026-09-24）：默认歌单实测 **4/10 → 8/10** 能播（`hasCookie:true`）。
  剩下两首 `FRND - Before U I Didn't Exist`、`FRND - Erase` 是 `code=404 reason=null`，网易云那边本身没版权，配 cookie 也拿不到，只能换歌
- [ ] 网易云 cookie 会过期（几个月到一年），哪天歌又播不动了就重新抄一次；上传方式见踩坑 14
- [x] AI 壁纸已上线（第四轮）：**没走 ComfyUI 的放大路线**，改用 imagegen 技能直接出 2560×1440 原图，
  再 `npm run wallpapers:ai` → `npm run wallpapers:palette` → 构建 → 部署，线上已验证
- [ ] ComfyUI 那条路留作备选（模型与配方见第八节），放大模型 `4x-UltraSharp.pth` 仍未装
- [ ] OpenAI 那条 AI 画图的路依然不通：需要账号有额度（目前没有），且代理出口要在受支持地区（香港节点会被拒）
- [ ] 国内访问的根本瓶颈是 Cloudflare 没有国内节点（要域名备案才能用国内 CDN），暂未处理

## 七、环境事实

- 网络：本机代理 `127.0.0.1:7890`（当前出口日本）。GitHub / scoop 需要它；Cloudflare API 直连可用；OpenAI API 需要代理 + 有额度的账号
- 硬件：**RTX 5070 Laptop GPU（8GB 显存，驱动 617.14）+ Blackwell 架构（`sm_120`）**。
  D: 盘还剩 90GB 左右（ComfyUI + 模型已占约 12GB）
- 工具（现在都在 PATH 上，scoop shims）：
  - Node（主站依赖齐全）、wrangler（在 `yuki-theme` / `yuki-moments` 的 devDependencies 里）
  - **Lua 5.5.0**（`scoop install lua`；之前 winget 那个 5.4.6 已经不在机器上了）
  - **ffmpeg / ffprobe 9.0.2**（`scoop install ffmpeg`，压音频用）
  - 7-Zip 26.00（`7z`，解压用）
  - 注意：`scoop bucket add main` 是这轮才加的，之前 scoop 只有 7zip/mingw 两个 app、没有 bucket
- 截图验证：本机已缓存 Playwright 的 Chromium（`C:\Users\ROG\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe`）。
  任意可写目录里 `npm install playwright-core`（走 7890 代理），再 `chromium.launch({ executablePath })` 就能截图，
  **不用重新下浏览器**；本轮实测可以直接 `createRequire` 借用
  `C:\Users\ROG\.codex\visualizations\2026\09\24\01a0d3b5-8e2d-7960-9f72-c5d2747e2c5d\node_modules\playwright-core`，不用重装。本轮的截图证据在 `C:\Users\ROG\.codex\visualizations\2026\09\24\01a0d3b5-8e2d-7960-9f72-c5d2747e2c5d`。
- 密钥：动态发布密码、网易云 Cookie 都只存在 Cloudflare secret 里，**不在仓库、也不在本机**

## 八、本地 AI 画图（ComfyUI，2026-09-24 装好）

解压位置：`D:\ComfyUI_windows_portable`（3.9GB，来自 `D:\ComfyUI-dl\ComfyUI_windows_portable_nvidia.7z`）。
自带 `python_embeded`（Python 3.13）+ torch **2.13.0+cu130**，支持列表里有 `sm_120`，
所以 **RTX 5070 Laptop（8GB 显存、驱动 617.14）能直接跑**，不需要换 torch。

已下载的模型（放在 `ComfyUI\models\checkpoints`）：

| 文件 | 大小 | 用途 |
| --- | --- | --- |
| `animagine-xl-4.0.safetensors` | 6.46 GB | 动漫向 SDXL，主力模型 |
| `sd15-emaonly-fp16.safetensors` | 1.99 GB | SD1.5 官方版，备用 / 快速试参数 |

启动（命令行，保持这个进程不退）：

```powershell
D:\ComfyUI_windows_portable\python_embeded\python.exe -s D:\ComfyUI_windows_portable\ComfyUI\main.py --windows-standalone-build --listen 127.0.0.1 --port 8188
```

浏览器开 `http://127.0.0.1:8188` 是图形界面。命令行批量出图本轮写了两个脚本（在
`C:\Users\ROG\.codex\visualizations\2026\09\24\01a0d3b5-8e2d-7960-9f72-c5d2747e2c5d`）：
`comfy-generate.js`（第一轮）和 `comfy-round2.js`（第二轮，去了商标），走的是 ComfyUI 的 HTTP API。

实测速度（1216×832、28–30 步、cfg 6、`euler_ancestral`）：**首张约 35s（含加载模型），之后每张 16–18s**。

### 坑一：`official art` + `blue archive` 会画出商标

模型训练数据里的官方图带 logo。第一轮 prompt 用了 `blue archive` 加 `official art`，
三张成图的角落全出现了「Blue Archive」商标和一行版权字；
负向里写 `logo, copyright name, text` 也压不住（权重 `(logo:1.5)` 效果有限）。

**最终可行的配方**：

- 正面**保留** `blue archive` + 角色名标签（`shiroko (blue archive)`、`yuuka (blue archive)`、
  `hoshino (blue archive)`、`alice (blue archive)` 等），这样人物才像本人
- 正面**去掉 `official art`**（它就是往官方宣传图方向拽的那个词），
  改用 `very awa, newest, absurdres, masterpiece`
- 偶尔角落还会漏一行小字 → 直接裁掉 2.5% 边缘（`crop=iw*0.975:ih*0.955`），
  反正后面导入还要放大，不差这点像素

### 坑二：不加景别就会变成「大场景小人」

prompt 里只写场景（`kivotos city street`、`futuristic hall`）时，模型倾向把人物画得很小，
成图更像风景照。想让人物当主体就明确写 `cowboy shot`（或 `upper body`）+ `looking at viewer`。

### 出图用的 prompt 骨架

```
masterpiece, high score, great score, absurdres, very awa, newest, anime wallpaper,
blue archive, <角色名> (blue archive), 1girl, solo, cowboy shot, <发色/瞳色/光环>,
<服装>, <动作>, <场景>, looking at viewer, cinematic lighting, detailed background

负向: (logo:1.5), (copyright name:1.5), (artist name:1.4), (english text:1.4),
      (watermark:1.4), (signature:1.4), worst quality, low quality, bad anatomy,
      extra digits, fewer digits, jpeg artifacts, blurry, nsfw
```

参数：`animagine-xl-4.0.safetensors`、1216×832、30 步、cfg 6、`euler_ancestral`、seed 自定。

### 还没做

这批图是 1216×832，而 `npm run wallpapers:import` 会把桌面版拉到 **2560 宽**、
手机版从原图**居中裁成 1080×1920**——直接导入等于放大两倍多，糊。
要真正上岗得先补个放大模型（例如 `4x-UltraSharp.pth`，约 64MB），
先放大到 2432×1664 左右再导入，然后照常跑 `wallpapers:palette` / `wallpapers:variants`。

### 生成记录（都在证据目录，脚本同名对照）

| 文件 | 内容 | 结论 |
| --- | --- | --- |
| `ai-*.png` | 第一轮：雨夜城市 / 云海天台 / 科幻场景 | 画质好，但**带 BA 商标**，弃用 |
| `ai2-*.png` | 第二轮：去掉 `blue archive` 标签 | 干净但「像 BA」只是风格像，不是角色 |
| `ai3-g-shiroko-night.png` | **砂狼白子**：雨夜霓虹街道、狼耳、蓝围巾 | ✅ 像本人、无商标 |
| `ai3-j-trinity-scenery.png` | **三一综合学园**：哥特教堂 + 樱花、无人风景 | ✅ 好风景 |
| `ai3-h/i-*.png` | 优香 / 爱丽丝（远景色） | 人物太小，被第四轮取代 |
| `ai4-k-yuuka-desk.png` | **早濑优香**：教室窗前抱臂，黑色环状光环 | ✅ 最像本人 |
| `ai4-l-alice-hall-clean.png` | **天童爱丽丝**：白色长廊走向镜头 | ✅ 已裁边去小字 |
| `ai4-m-hoshino-sunset-clean.png` | **小鸟游星野**：黄昏沙漠废墟 + 大狙 | ✅ 已裁边去小字 |

脚本：`comfy-generate.js`（第一轮）、`comfy-round2.js`、`comfy-round3.js`（角色 + 风景）、
`comfy-round4.js`（人物拉近）。想复现直接 `node comfy-round4.js`（服务得先起）。

### 补充：线上那 4 张其实不是 ComfyUI 出的

第四轮改用了 imagegen 技能直接生成 **2560 宽**原图（三张 2560×1707、一张 2560×1440：`output/imagegen/01-shiroko-neon-night.png`、
`02-yuuka-window.png`、`03-hoshino-sunset.png`、`04-trinity-cathedral.png`，`output/` 已 gitignore），
再用 `npm run wallpapers:ai` 转成三种规格。好处是不用纠结放大模型；ComfyUI 仍可用于批量换风格。

## 九、新任务怎么开工

在新会话里直接说这句（或把它发给助手）：

> 读 `C:\Users\ROG\Desktop\yuki-theme\docs\HANDOFF.md`，然后按里面的状态继续做博客。
> 我这边的代理端口是 7890。

另外：单个会话聊太久、贴了太多图片/长日志时，模型接口会报 **413 Payload Too Large（body 超限）**。
所以每轮收工都要把状态写回这份 HANDOFF，然后**直接开新会话**接着做，别在一个会话里硬撑。

想接着做具体某件事，就在后面补一句，例如「继续写文章：性能优化复盘」
或「把生成的 AI 壁纸先放大再导进轮换」。
