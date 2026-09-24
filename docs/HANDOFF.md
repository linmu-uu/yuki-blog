# 交接文档（HANDOFF）

> 用途：这是一个长期在做的个人博客项目。**新开一个 Codex 任务时，让助手先读这份文档**，
> 就能立刻接上进度，不用把之前几万字的对话重新搬一遍。
>
> 最后更新：2026-09-24（第二轮：RSS / 站点地图 / 404 / 分享卡片）

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

- 主站：**9 篇文章**、搜索索引 41948 字；构建 **19 个页面**（多了 `404.html`）约 1.4 秒；工作区干净
- 主站线上版本：`20e559e9-18ad-4f47-b3c0-ec1b256f244a`（Worker 名 `firefly`）
- 音乐接口线上版本：`b5196ea7-5a41-4b10-b5a3-10f1070a7e39`
- 最近提交：`aaaaddb`（RSS 订阅 / 站点地图 / 自定义 404 / OG 分享卡片）
- 主要功能：首页（壁纸轮换 + 跟随壁纸变色）、文章、动态、相册、友链、留言、关于、**搜索**、发布后台 `/admin`、
  **RSS 订阅 `/rss.xml`**、**站点地图 `/sitemap.xml`**、`robots.txt`、**自定义 404 页**
- 首页资料卡的「文章 / 标签」数现在是读内容集合实时算的（以前写死在 `src/data/site.ts`，发到第 9 篇还显示 3）

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
- [ ] 想让搜索、RSS 收录新文章时别忘了 `npm run search:index`（RSS / 站点地图是构建时自动生成的）
- [ ] 音乐：网易云有些歌需要会员/版权，拿不到播放地址会自动跳过；把 `NETEASE_COOKIE` 存成 `yuki-music` 的 secret 可以解锁更多
- [ ] 音频 `bgm.mp3` 39 秒却有 936KB（约 192kbps），可以压到 96–128kbps 省一半流量
- [ ] 动态里有两张早期上传但没绑定到任何动态的「孤儿图片」，可以清理
- [ ] 想继续做 AI 壁纸：需要 OpenAI 账号有额度（目前没有）；代理出口要在受支持地区（香港节点会被拒）；本地绘画方案 ComfyUI 便携包已下好放在 `D:\ComfyUI-dl\ComfyUI_windows_portable_nvidia.7z`（1.8GB），还没解压安装
- [ ] 国内访问的根本瓶颈是 Cloudflare 没有国内节点（要域名备案才能用国内 CDN），暂未处理

## 七、环境事实

- 网络：本机代理 `127.0.0.1:7890`（当前出口日本）。GitHub / scoop 需要它；Cloudflare API 直连可用；OpenAI API 需要代理 + 有额度的账号
- 工具：Node（主站依赖齐全）、Lua 5.4.6（winget 装的 `DEVCOM.Lua`，**新终端才有 PATH**）、wrangler（在 `yuki-theme` 和 `yuki-moments` 的 devDependencies 里）
- 截图验证：本机已缓存 Playwright 的 Chromium（`C:\Users\ROG\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe`）。
  任意可写目录里 `npm install playwright-core`（走 7890 代理），再 `chromium.launch({ executablePath })` 就能截图，
  **不用重新下浏览器**。本轮的截图证据在 `C:\Users\ROG\.codex\visualizations\2026\09\24\01a0d3b5-8e2d-7960-9f72-c5d2747e2c5d`。
- 密钥：动态发布密码、网易云 Cookie 都只存在 Cloudflare secret 里，**不在仓库、也不在本机**

## 八、新任务怎么开工

在新会话里直接说这句（或把它发给助手）：

> 读 `C:\Users\ROG\Desktop\yuki-theme\docs\HANDOFF.md`，然后按里面的状态继续做博客。
> 我这边的代理端口是 7890。

想接着做具体某件事，就在后面补一句，例如「继续写文章：性能优化复盘」或「把 ComfyUI 装上试试本地画图」。
