# 交接文档（HANDOFF）

> **用途**：这是一个长期在做的个人博客项目。新开一个 Codex 会话时，让助手先读这份文档，就能立刻接上进度。
>
> **本版**：2026-10-01 重写（第五轮起点）。前四轮的完整叙述和 38 条踩坑的详细经过都留在
> `docs/HANDOFF-2026-09-archive.md`，本文只保留**现在要用的东西**。
>
> **新会话开场白**（照抄即可）：
> > 读 `C:\Users\ROG\Desktop\yuki-theme\docs\HANDOFF.md`，然后按里面的状态继续做博客。代理端口 7890。

## 一、项目地图

| 位置 | 是什么 | 线上地址 | 部署方式 |
| --- | --- | --- | --- |
| `C:\Users\ROG\Desktop\yuki-theme` | **主站**（Astro 6 + 自制蔚蓝档案风主题），有 git | https://yuki666.online | `npm run deploy` |
| `C:\Users\ROG\Desktop\yuki-moments` | 「动态」后端（Worker + D1，含配图） | https://moments.yuki666.online | `npx wrangler deploy` |
| `C:\Users\ROG\Desktop\twikoo-cloudflare` | 评论后端（自建 Twikoo） | https://twikoo.yuki666.online | `npx wrangler deploy` |
| `C:\Users\ROG\Desktop\yuki-music` | 音乐接口（代理网易云歌单） | https://music.yuki666.online | `npx wrangler deploy` |
| `D:\uuuj\steamapps\workshop\content\431960` | **壁纸引擎创意工坊库**（视频型 176 个 / 场景型 269 个） | — | 动态壁纸的素材来源 |
| `D:\ComfyUI_windows_portable` | 本地 ComfyUI（SDXL + 放大模型） | — | 命令行启动，见第八节 |
| `D:\New` | 助手人格设定（喵酱）+ 临时脚本 | — | — |
| `C:\Users\ROG\.codex\visualizations\2026\09\24\01a0d3fb-57f8-7270-b772-970fb500f2e9` | **助手证据 / 工具脚本目录**（截图、对比图、验收脚本，见第八节） | — | — |

所有 Worker 在同一个 Cloudflare 账号下，主站是纯静态资源 Worker（名字沿用老站的 `firefly`）。

## 二、当前状态快照（2026-10-01 核实）

- **内容**：11 篇文章、搜索索引 54654 字；构建 21 个页面，约 2 秒
- **线上版本**：`0b1766cb-69dc-44a2-bd6c-a274ba6048de`（Worker `firefly`）
- **工作区**：干净（`git status` 无改动）
- **壁纸**：静态 **17 张**（`ba-*` 13 张自己找的 + `ai-*` 4 张 AI 原创）+ 动态 **16 张**（`mv-*`，壁纸引擎视频，共 32.9MB）
- **首页行为**：随机挑一张（刷新换）→ 90 秒轮换 → 主题配色跟着壁纸走 → 动态壁纸自动播放（右下角有开关）
- **质量**：Lighthouse 首页 **99（手机）/ 100（桌面）**，无障碍 / 最佳做法 / SEO 全站 **100**；首页总字节 ~340KB
- **SEO**：全站 JSON-LD（WebSite / BlogPosting / BreadcrumbList）、每篇文章一张 1200×630 分享卡片、sitemap（带 lastmod 与图片）、RSS、robots.txt；**Google Search Console 验证 meta 已上线**（主人提交 sitemap 即可）
- **评论**：Twikoo 自建，懒加载；留言框的无障碍补丁已做（aria-label / 可爬链接）
- **音乐**：`NETEASE_COOKIE` 已配置，默认歌单 10 首里 **8 首**能播（剩 2 首网易云无版权）
- **仓库体积**：330MB（其中 `output/imagegen-hires/` 207MB 是 AI 壁纸的 4 倍放大母版，已 gitignore）
- **磁盘**：C 剩 174GB，**D 只剩 29GB**（ComfyUI + 模型 + 母版 PNG 占得多，注意）

## 三、常用命令

### 主站（`yuki-theme` 目录）

```bash
npm run dev              # 本地开发 http://127.0.0.1:4321
npm run build            # 构建到 dist/
npm run deploy           # 构建 + 部署到 Cloudflare

npm run search:index     # 用 Lua 重建站内搜索索引（加完文章必跑）
npm run admin            # 本地发布后台（发动态用）
npm run gallery:thumbs   # 生成相册缩略图
```

### 壁纸（静态）

```bash
npm run wallpapers:import          # 从 D:\wallpapers 导入（压成 AVIF，注意：默认会清空重编号）
node scripts/import-wallpapers.mjs D:/wallpapers/new1 --append   # 追加导入（不动已有编号）
npm run wallpapers:variants        # 补 1600px 小图
npm run wallpapers:palette         # 重新提取配色（主题色）
npm run wallpapers:sizes           # 重算 srcset 用的真实宽度表
```

### 壁纸（动态 / 视频）

```bash
# 从壁纸引擎工坊导入（--we 后面跟工坊 id，可以给多个）
npm run wallpapers:video -- --we 3406897158 3271510748
# 整批重导（换编码参数时用，编号从 01 重排）
npm run wallpapers:video -- --reset --we <id> <id> ...
# 也能吃普通目录：node scripts/import-wallpaper-videos.mjs D:/wallpapers/video

npm run wallpapers:hash    # 给资源加内容哈希（导入脚本会自动跑，一般不用手动）
```

导入完照例 `wallpapers:palette` → `wallpapers:sizes` → `npm run deploy`。

### 后端项目

```bash
npx wrangler deploy                  # 部署
npx wrangler tail <worker名>          # 实时日志（注意是位置参数，不是 --name）
npx wrangler secret put <NAME>       # 设置密钥
```

## 四、改什么去哪儿

| 想改什么 | 去哪改 |
| --- | --- |
| 站点标题、导航、社交链接、音乐接口地址 | `src/data/site.ts` |
| 首页布局（左小组件 / 中文章 / 右日历） | `src/pages/index.astro` |
| 首屏（标题、打字机、壁纸容器、动态开关） | `src/components/HeroBanner.astro` |
| 壁纸轮换 / 主题色应用 / 动态壁纸开关逻辑 | `src/scripts/wallpaper.ts` |
| 壁纸白名单、srcset 生成 | `src/data/background.ts`（`ALLOWED_PREFIXES` = `ba- ` `ai-` `mv-`） |
| 壁纸配色（取色算法） | `scripts/extract-palettes.mjs`（**色相不限制**，按图走） |
| 动态壁纸清单 | `src/data/wallpaper-videos.json`（自动生成，别手改） |
| 文章字段校验 | `src/content.config.ts` |
| 文章分享卡片 | `src/pages/og/[slug].jpg.ts`（构建时 sharp 渲染 SVG） |
| 结构化数据 | `src/data/seo.ts` + `BaseLayout.astro` 的 `schema` 属性 |
| 缓存策略 | `public/_headers`（Cloudflare 是**合并**不是覆盖，通配符**不跨 `/`**） |
| 部署配置 | `wrangler.toml` |
| 搜索索引生成器 | `tools/build-search-index.lua` |
| 留言区（Twikoo 接入 + 无障碍补丁） | `src/components/Comment.astro` |

## 五、壁纸系统（现在最复杂的一块，改动前必读）

### 两类壁纸

| 类型 | 前缀 | 是什么 | 数量 |
| --- | --- | --- | --- |
| 静态 | `ba-*` | 自己找的图，`npm run wallpapers:import` 导入 | 13 |
| 静态 | `ai-*` | AI 原创图，母版经 ComfyUI `4x-AnimeSharp` 放大 | 4 |
| **动态** | `mv-*` | **壁纸引擎的视频壁纸**，视频 + 海报双轨 | 16 |

### 动态壁纸怎么工作（双轨设计）

每张动态壁纸由**五份资源**组成，共用同一个内容哈希后缀：

```
public/wallpaper/video/mv-desktop-01-8a9781d6.mp4      桌面视频（2560 宽 / 5s / CRF28 / tune animation）
public/wallpaper/video/mv-mobile-01-8a9781d6.mp4       手机视频（1280 宽 / CRF31）
public/wallpaper/desktop/mv-desktop-01-8a9781d6.avif   桌面海报（静态兜底 + 主题配色来源）
public/wallpaper/desktop/mv-desktop-01-8a9781d6-1600.avif  海报小图
public/wallpaper/mobile/mv-mobile-01-8a9781d6.avif     手机竖版海报
```

- **海报**走原来的静态壁纸管线（配色、srcset、缓存全复用），首屏 LCP 永远是海报
- **视频**只在条件合适时下载：**桌面默认播**，手机默认不播（要用户点开关），系统开了「减弱动效」不播，省流/2G/3G 不播
- 右下角开关写着**状态**（「动态壁纸 / 静态壁纸」，这是主人选定的写法，别再改成动作文案）
- 视频等 `window.load` + 空闲时才下载，别跟首屏抢带宽
- 文件名**必须带内容哈希**：`/wallpaper/*` 缓存一天，名字不变的话换了内容用户还看旧缓存（真踩过）

### 挑素材的硬指标（`we-screen.mjs` 的思路，别按标题瞎挑）

| 指标 | 阈值 | 为什么 |
| --- | --- | --- |
| 宽高比 | ≥ 1.7 | 太方/竖图铺满全屏会裁掉大半 |
| 左右边缘亮度 | > 0.12 | 低于这个值说明素材**自带黑边**，永远铺不满 |
| 缩到 2560 宽后的锐度 | ≥ 65（画风偏软的插画可放宽到 50） | 量化"糊不糊" |
| 内容 | 二次元女性、要美 | 主人明确要求 |
| 开局帧 | 抽 0.1s / 1.5s 各一帧看一眼 | 有的素材开局是特写或淡入，很难看 |

## 六、踩坑速查（38 条压缩版）

> 详细经过（含代码片段、当时的报错）在 `docs/HANDOFF-2026-09-archive.md`。

### Astro / 前端

| # | 一句话 |
| --- | --- |
| 4 | Astro 的 scoped 样式靠 `data-astro-cid-*` 匹配；**JS 动态建的节点（innerHTML / createElement）没有这个属性，样式整块失效**，重绘后要 `applyScope()` 补回 |
| 9 | 视图过渡 + `[data-reveal]` 双层淡入会显得迟钝；动效只用透明度 |
| 11 | 视图过渡会拦截「非 HTML 链接」：`/rss.xml`、`/sitemap.xml` 要加 `data-astro-reload` |
| 19 | 懒加载的第三方样式（Twikoo 的 `<link>`）会被视图过渡换 head 时删掉 → 每次 boot 都要重新确认样式表在不在、并等 load 再渲染 |
| 22 | 给第三方组件打补丁先搞清它把 DOM 挪到哪：Twikoo 会把 `#tcomment` 换成 `#twikoo` |
| 27 | JS 才显示的按钮别留在文档流里（会推动同行元素，Lighthouse 记 CLS），绝对定位钉在角落 |
| 34 | 切页配色断层：新页面的 `<style>` 是构建时烘焙的，而当前壁纸是上一页延续的 → `show()` 里先 `applyTheme()`，并用 sessionStorage 记住"这一趟用第几张"（**只在浏览器后退/前进时沿用，刷新要重新随机**） |
| 38 | 动态壁纸开关文案用**状态**写法（主人选定），别再改成"暂停动效 / 播放动效" |

### 资源 / 缓存 / 性能

| # | 一句话 |
| --- | --- |
| 2 | HTML 必须允许"先用缓存"：`max-age=0, stale-while-revalidate=120` |
| 6 / 25 | **Workers 静态资源不支持 Range**：音频、视频拖进度条会失效（代码修不了） |
| 16 | 刚部署完的头几秒，新资源可能仍 404（换版本 + 边缘缓存），**等几秒带随机参数复查**再下结论 |
| 18 | `srcset` 的宽度描述符要写真实宽度（有的壁纸只有 1920 宽），否则浏览器挑错档 |
| 23 | 壁纸派生色（`--accent-2/3`）**不能当正文色**，对比度会随壁纸浮动——文字用固定色，色相靠底色 |
| 26 | 关视频别用 `removeAttribute("src") + load()`（会把下载打断成 `ERR_ABORTED`，再打开就回不来），改成暂停 + 收起复用 |
| 28 | 视频要等首屏图加载完再下载（否则 FCP 从 1.0s 掉到 2.9s） |
| 31 | 视频母版宽度要按**屏幕实际需要多少像素**出（1920 在 2560 屏上被放大 1.33 倍 = 糊） |
| 32 / 37 | 预取别跟首屏抢带宽：Astro 预取用 `hover`，自研预取等 **LCP 静默 800ms** 再跑，3g/省流量直接跳过 |
| 36 | **静态资源文件名不能固定**：`/wallpaper/*` 缓存一天，内容变了 URL 不变用户就一直看旧的 → 名字里带内容哈希 |

### Cloudflare / 后端

| # | 一句话 |
| --- | --- |
| 1 | `_headers` 是**合并**不是覆盖；通配符 `*` **不跨 `/`**，所以 `/gallery/blue-archive/*` 要逐个目录写 |
| 5 | D1 读出来的 BLOB 是数字数组，`new Response(row.data)` 会返回空 body，要先 `toBytes()` |
| 10 | 静态端点里写的响应头无效（会被写成文件），缓存策略去 `public/_headers` 配 |
| 12 | 404 页要显式打开：`wrangler.toml` 里 `not_found_handling = "404-page"` |
| 14 | secret 别用管道喂（末尾换行会被存进值里 → `TypeError: Invalid header value.`），用 `wrangler secret bulk` 传 JSON |

### 工具链 / 流程

| # | 一句话 |
| --- | --- |
| 3 | 国内网络下 Astro 自带的 `<link rel=prefetch>` 常常压着不发，站点自己实现了 `src/scripts/prefetch.ts` |
| 7 | 文章 front-matter 的 `description` 含 `#` 或 `:` 时**必须加引号**（YAML 会截断） |
| 8 | Lua：多个捕获时 `local x = s:match("(a)(b)")` 只拿到第一个；字符类按**字节**匹配（`[^,，]` 会切碎中文） |
| 13 | 竖版壁纸别信 sharp 的 `attention` 自动重心（会被霓虹灯牌/天空带偏），逐张手填 `FOCAL_X` |
| 17 | 写补丁脚本时 JS 字符串会吃掉正则转义（`\d` 变成 `d`）→ 用 `String.raw` 或双写反斜杠，改完回读确认 |
| 20 | schema.org 验证器的返回体带 `)]}'` 前缀，直接 `JSON.parse` 会炸 |
| 21 | 用 SVG 画文字卡片时，折行要按字号算宽度，否则会溢出画布 |
| 24 | `wallpapers:import` 默认「清空重编号」，只是新加图要用 `--append` |
| 29 | `Number(new URLSearchParams(...).get("x"))` 在参数不存在时是 **0** 不是 NaN（会让随机失效、锁死在第 0 张） |
| 30 | 取色脚本原本把色相硬夹在"蔚蓝档案蓝"附近 → 所有壁纸主题色一样。现在只规整饱和度/亮度，色相按图走 |
| 33 | 视频壁纸要按硬指标筛（见第五节） |
| 35 | 视频壁纸还要看开局那一帧 |

## 七、待办 / 下一步

- [ ] **GSC 提交**：验证已通过的话，在 Search Console 里提交 `sitemap.xml`（要主人的账号，助手做不了）
- [ ] **动态壁纸**：还想加就用 `npm run wallpapers:video -- --we <id>`；库里还剩 150+ 个视频型没挑
- [ ] **D 盘空间**：只剩 29GB，`output/imagegen-hires/` 占 207MB（可删，需要时用 ComfyUI 重跑）
- [ ] **`ba-desktop-11/12` 右上角带来源站水印**，介意就换图重导
- [ ] **老壁纸有几张原生宽度不到 2560**（`ba-desktop-01` 1920、`06` 2000）：宽屏上会被拉伸，有空重导
- [ ] **SEO 还能继续做**：① `/tags/<标签>/` 标签落地页（长尾搜索好使）；② 文章底部「相关文章」
- [ ] **Lighthouse 剩余**：Twikoo 那个 588KB 的 JS 没带 source map（权重 0，不影响分数）
- [ ] **国内访问**：根本瓶颈是 Cloudflare 没有国内节点（要备案才能上国内 CDN），暂未处理

## 八、本地工具链（现在都在 PATH 上）

- Node v24 / npm 11；ffmpeg & ffprobe 9.0.2；Lua 5.5（`scoop install lua`）；7-Zip 26
- **ComfyUI**：`D:\ComfyUI_windows_portable`，启动命令
  `D:\ComfyUI_windows_portable\python_embeded\python.exe -s D:\ComfyUI_windows_portable\ComfyUI\main.py --windows-standalone-build --listen 127.0.0.1 --port 8188`
  - 模型：`animagine-xl-4.0`（动漫）、`sd15-emaonly-fp16`、放大模型 `4x-AnimeSharp` + `4x-UltraSharp`
  - 出图配方（画 BA 角色不糊、不带商标）在归档文档第八节
- **壁纸引擎库**：`D:\uuuj\steamapps\workshop\content\431960`（视频 176 / 场景 269；场景型 `.pkg` 跑着色器，网页搬不了）
- **截图验证**：本机已缓存 Chromium `C:\Users\ROG\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe`；
  playwright-core 可以直接借用证据目录里那份（`...\2026\09\24\01a0d3b5-.../node_modules/playwright-core`）
- **Lighthouse**：装在证据目录（`lh-run.mjs <url> [mobile|desktop|scores]`），跑之前要把 `TEMP/TMP` 指到可写目录，否则 chrome-launcher 清理临时目录会 `EPERM`
- **助手证据目录**（上面项目地图里那个）：里面躺着这一轮写的验收脚本，都能直接复用
  - `lh-run.mjs <url> [mobile|desktop|scores]` —— 跑 Lighthouse（要先把 `TEMP/TMP` 指到可写目录）
  - `we-screen.mjs` / `we-rescreen.mjs` —— 把壁纸引擎库里所有视频型壁纸按硬指标筛一遍
  - `we-sheet.mjs ids <id> <id>` —— 给候选素材抽帧拼对照图，肉眼挑
  - `opening-check.mjs` —— 检查视频壁纸开局那一帧
  - `comfy-upscale.mjs` —— 调本机 ComfyUI 放大图片
  - `consistency-check.mjs` —— 清单/尺寸表/配色/文件一致性自检
  - `wallpaper-rotation-check.mjs` / `theme-continuity-check.mjs` / `motion-button-check.mjs` —— 壁纸轮换、配色、开关的行为验收
  - `schema-check.mjs` —— 用 schema.org 验证器查结构化数据
- **网络**：本机代理 `127.0.0.1:7890`（fake-ip 模式，`Resolve-DnsName` 结果不可信，要看真实解析走 DoH）
  - GitHub / scoop / npm 走代理；Cloudflare API 直连可用
  - 实测过：走系统代理请求 `https://yuki666.online/sitemap.xml` 偶尔会卡到超时，`curl.exe`（直连）正常——是代理抽风，不是站点问题

## 九、新任务怎么开工

1. 让助手读这份文档（开头有现成的开场白）
2. **说明这一轮想做什么**（加文章？改样式？加壁纸？）
3. 收工前让助手把状态写回本文档，并**开新会话**继续下一轮

> ⚠️ **单个会话别拖太长**：聊太久、贴太多图片/长日志时，模型接口会报
> **413 Payload Too Large（body 超限）**。所以每轮收工写回文档 → 开新会话，是最稳的节奏。

## 附：历史轮次（一句话）

- **第一轮**：主题搭建（布局、壁纸轮换、主题色、动效、花瓣）
- **第二轮**：站内搜索（Lua 生成索引）、发布后台、动态页、相册、友链
- **第三轮**：新文章《SEO 基建》、音频瘦身、动态孤儿图清理、本机工具链（Lua 5.5 / ffmpeg）
- **第四轮**：AI 原创壁纸上线并高清化 → 留言区修复 → SEO（JSON-LD + 分享卡片）→ 无障碍修到满分 → 追加壁纸 → **动态壁纸（壁纸引擎视频）** → 性能三轮优化
- **第五轮起点**：2026-10-01，本文档重写
