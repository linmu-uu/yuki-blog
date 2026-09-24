# 交接文档（HANDOFF）

> 用途：这是一个长期在做的个人博客项目。**新开一个 Codex 任务时，让助手先读这份文档**，
> 就能立刻接上进度，不用把之前几万字的对话重新搬一遍。
>
> 最后更新：2026-09-24（第三轮：新文章《SEO 基建》+ 音频瘦身 + 动态孤儿图清理 + 本机工具链）

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

- 主站：**10 篇文章**、搜索索引 48765 字；构建 **20 个页面**约 1.5 秒；工作区干净
- 主站线上版本：`6735adb9-567e-4bfa-9cb6-62371ff65941`（Worker 名 `firefly`）
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

## 六、待办 / 已知问题

- [x] `yuki-moments` 已 `git init` 并提交首次快照（commit `2abb539`，.gitignore 已排除 node_modules/.wrangler/.dev.vars）
- [x] `twikoo-cloudflare` 的配置改动已确认提交（commit `1185fee`：自定义域名 + 本站 D1）
- [x] 音频 `bgm.mp3` 已压到 102kbps（497KB，原来 936KB）
- [x] 动态里的孤儿配图已清理（实际 3 张）
- [ ] 加完文章记得跑 `npm run search:index`（RSS / 站点地图是构建时自动生成的，不用管）
- [ ] 音乐：网易云有些歌需要会员/版权，拿不到播放地址会自动跳过；把 `NETEASE_COOKIE` 存成 `yuki-music` 的 secret 可以解锁更多
- [ ] AI 壁纸：**ComfyUI 已装好、能出图**（详见第八节），下一步是补放大模型 → `wallpapers:import` → `wallpapers:palette` / `wallpapers:variants` → 部署
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
  **不用重新下浏览器**。本轮的截图证据在 `C:\Users\ROG\.codex\visualizations\2026\09\24\01a0d3b5-8e2d-7960-9f72-c5d2747e2c5d`。
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

### 坑：prompt 里写 `blue archive` 会画出商标

模型训练数据里的官方图带 logo，所以正文只要出现 `blue archive` 这个标签，
成图上就会出现「Blue Archive」商标和一行版权字。负向里加
`logo, copyright name, artist name, text` 也压不太住，**最有效的做法是正文根本别写这个标签**，
改用 `official art, anime screencap, very awa` 这类描述来定性风格。

### 还没做

这批图是 1216×832，而 `npm run wallpapers:import` 会把桌面版拉到 **2560 宽**、
手机版从原图**居中裁成 1080×1920**——直接导入等于放大两倍多，糊。
要真正上岗得先补个放大模型（例如 `4x-UltraSharp.pth`，约 64MB），
先放大到 2432×1664 左右再导入，然后照常跑 `wallpapers:palette` / `wallpapers:variants`。

### 本轮生成的图

| 文件（证据目录） | 内容 |
| --- | --- |
| `ai-a-night-city.png` / `ai-b-day-sky.png` / `ai-c-holo-scape.png` | 第一轮，画质好但带 BA 商标 |
| `ai2-d-night-girl.png` | 雨夜霓虹街道 + 白发少女，构图居中，最适合做壁纸 |
| `ai2-e-rooftop-day.png` | 白昼云海天台 |
| `ai2-f-holo-hall.png` | 无人物的科幻走廊 |

## 九、新任务怎么开工

在新会话里直接说这句（或把它发给助手）：

> 读 `C:\Users\ROG\Desktop\yuki-theme\docs\HANDOFF.md`，然后按里面的状态继续做博客。
> 我这边的代理端口是 7890。

想接着做具体某件事，就在后面补一句，例如「继续写文章：性能优化复盘」
或「把生成的 AI 壁纸先放大再导进轮换」。
