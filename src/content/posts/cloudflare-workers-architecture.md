---
title: "一个「纯静态」博客背后的五个 Worker"
published: 2026-09-22
description: "主站是静态资源，但动态、评论、相册图、音乐歌单、搜索索引各有各的去处。这篇讲这套 Cloudflare Workers 架构怎么搭起来、前端怎么把它们串起来，以及三个真实踩过的坑。"
tags: [Cloudflare, 架构, 建站]
category: 建站笔记
draft: false
---

这个博客对外说是「静态站点」：没有数据库驱动的页面，没有常驻服务器，`npm run deploy` 一推就上线。

但实际上，它背后跑着**五个 Cloudflare Worker**。这篇就把这套架构摊开讲讲——为什么这么拆、
前端怎么把它们串起来、以及踩过哪些坑。

## 全景图

```
                        ┌─────────────────────────────┐
   yuki666.online ────► │  firefly（静态资源 Worker）  │  dist/ 里的 HTML/CSS/JS/图
                        └─────────────────────────────┘

   moments.yuki666.online ──► yuki-moments ──► D1（动态 + 配图）
   twikoo.yuki666.online  ──► twikoo-cloudflare ──► D1（评论）
   music.yuki666.online   ──► yuki-music ──► 网易云接口（歌单 + 播放地址）
   （无域名）             ──► 本地 Lua 工具生成 search-index.json，跟静态资源一起发
```

| Worker | 域名 | 干什么 | 数据放哪 |
| --- | --- | --- | --- |
| `firefly` | yuki666.online | 托管整个静态站点 | 无（纯静态资源） |
| `yuki-moments` | moments.yuki666.online | 动态的增删查、配图上传与读取 | D1 |
| `twikoo-cloudflare` | twikoo.yuki666.online | 评论系统后端 | D1 |
| `yuki-music` | music.yuki666.online | 代理网易云歌单与播放地址 | 无（边缘缓存） |
| 本地 Lua 工具 | — | 生成站内搜索索引 | 产物提交进仓库 |

为什么拆成这么多个而不是一个？三个理由：

1. **炸一个不连坐**：评论后端出问题，动态和站点照常
2. **各自独立部署**：改动态不用动主站，改主站不用重发评论
3. **权限边界清楚**：只有动态和评论两个 Worker 碰数据库，主站连数据库绑定都没有

代价是多几个域名、多几次 TLS 握手——这个后面单独说怎么缓解。

## 一、主站：assets-only Worker

主站是"纯静态"，所以它的 Worker 里没有一行业务代码，只有一份配置：

```toml
name = "firefly"
compatibility_date = "2026-09-20"

[assets]
directory = "./dist"

[vars]
NODE_VERSION = "22"
```

`[assets]` 是 Workers 的静态资源托管：把 `dist/` 目录整个交给它，请求进来直接命中边缘缓存，
不经过任何脚本。特点：

- **部署就是上传文件**：`astro build` 产出什么，线上就是什么
- **`public/_headers` 生效**：缓存策略写在文件里，跟着代码走
- **不消耗 Worker 请求额度**（静态资源是单独的计费项）

> 配置里 Worker 名字还叫 `firefly`，因为 `yuki666.online` 这个自定义域名最早绑在它上面。
> 换名字等于新建一个 Worker，还要去后台把域名搬过去——收益不大，就一直没动。

### 缓存策略：静态站点的命门

`public/_headers` 里定了两档策略：

```
# 带内容哈希的产物：内容永不改变，缓存一年
/_astro/*
  Cache-Control: public, max-age=31556952, immutable

# 图片、音频：不带哈希，缓存一天
/gallery/blue-archive/*
  Cache-Control: public, max-age=86400

# HTML：允许先用缓存渲染，同时后台重新验证
/
  Cache-Control: public, max-age=0, stale-while-revalidate=120
```

最后那条是**国内访问优化的关键**：`max-age=0` 保证部署后内容最多两分钟内更新，
而 `stale-while-revalidate=120` 允许浏览器在两分钟内**直接用旧缓存先把页面画出来**，
同时在后台去取新的。

听起来不起眼，但它决定了"切换栏目"这件事到底是等一次跨境往返（200~600ms），
还是瞬间完成（0ms）——因为预取下来的 HTML 只有可被复用，预取才有意义。

## 二、动态后端：Worker + D1 + 图片存 BLOB

动态（moments）是最像"正经后端"的一个：

```toml
name = "yuki-moments"
main = "src/index.js"
routes = [{ pattern = "moments.yuki666.online", custom_domain = true }]

[[d1_databases]]
binding = "DB"
database_name = "yuki-moments"
database_id = "..."
```

接口一共五个：

| 接口 | 说明 |
| --- | --- |
| `GET /api/moments` | 公开读取动态列表 |
| `POST /api/moments` | 发布（需要 `Authorization: Bearer 密码`） |
| `DELETE /api/moments/:id` | 删除（同上） |
| `POST /api/upload` | 上传配图（前端已压缩，这里只存） |
| `GET /api/image/:id` | 读取配图（公开，`immutable` 缓存一年） |

D1 就是 Cloudflare 的 SQLite。两张表：`moments` 存正文，`images` 存图片二进制。

**不用 R2 存图**，是因为这套东西的定位就是"个人博客的几张配图"：
浏览器端把图压到 900KB 以内，直接以 BLOB 塞进 D1，再由 Worker 取出来返回。
省掉一个存储产品的配置与费用，代价是单张图不能太大——这个 900KB 的上限就写在代码里。

### 坑一：D1 读出来的 BLOB 是"数字数组"

图片接口上线后出现过这个症状：**接口返回 200、Content-Type 也对，但 body 是 0 字节**。

排查方式很直接——用 `wrangler dev --remote` 在本地直连线上 D1，加一个临时调试路由，
把 `typeof row.data` 打出来：

```json
{ "type": "object", "isArray": true, "ctor": "Array", "length": 139270 }
```

D1 读出来的 BLOB **是普通的"数字数组"（`number[]`）**，不是 ArrayBuffer。
而 `new Response(数字数组)` 并不会把它拼成二进制，结果就是空 body。

修法就是转一层：

```js
function toBytes(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return new Uint8Array(0);
}

return new Response(toBytes(row.data), {
  headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" },
});
```

`toBytes` 把几种可能的形态都兜住了，以后再换运行时也不至于再翻一次车。

## 三、评论后端：Twikoo + 懒加载

评论用的是自建 Twikoo（一个开源的评论系统），后端同样跑在 Worker 上。
它对前端的意义只有一条：**别让它在首屏就被加载**。

Twikoo 的前端 JS 有 170KB 左右，还带一些第三方请求（表情包 CDN）。之前是一进页面就加载，
现在改成留言区**快滚进视口时**才注入脚本，首屏直接省掉 180KB。

```js
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.disconnect();
    void boot();          // 这时候才去插 CSS/JS，再初始化
  }
}, { rootMargin: "600px 0px" });   // 提前 600px 就开始准备
```

`rootMargin: 600px` 是个手感问题：滚到底部才加载会明显看到"评论在加载中"，
提前 600 像素准备，用户滑到的时候往往已经好了。

## 四、音乐后端：代理一个第三方接口

音乐这块比较特殊：歌单在网易云上，而网易云的页面**没法被浏览器直接读**（CORS + 登录 + JS 渲染）。

所以写了个 Worker 当代理：

| 接口 | 说明 |
| --- | --- |
| `GET /playlist?id=...` | 歌单信息 + 曲目列表（曲名/歌手/封面），边缘缓存 10 分钟 |
| `GET /url?id=...` | 取单曲播放地址，缓存 3 分钟（网易云地址约 20 分钟过期） |

细节都在代码里：

- 请求带 `User-Agent` / `Referer`，网易云对这个比较挑
- 返回里把 `http://` 的图片地址统一换成 `https://`，否则在 https 页面上会被浏览器拦掉
- 想解锁更多歌（会员/版权限制的），把登录 Cookie 存成 secret：
  ```bash
  npx wrangler secret put NETEASE_COOKIE
  ```
- 拿不到播放地址的歌，前端**自动跳过并给出提示**，不会卡在一首放不了的歌上

### 坑二：静态资源不支持 Range 请求

播放器本来支持点进度条跳转，本地预览一切正常——因为本地服务器返回 `206 Partial Content`。
部署到线上之后，拖动进度条会**从头开始播**。

原因：这个站点的静态资源（包括音频）不支持 `Range`，浏览器拿不到"从第 N 字节开始"的能力，
seek 就变成了重新加载。

代码修不了这个（托管层的行为），但可以让体验不难看：拖动后校验一下落点，
跳不动就明确说一声"这首曲子暂时不支持拖动进度"，而不是默默失败。

## 五、前端怎么把它们串起来

所有后端地址集中在 `src/data/site.ts` 一处：

```ts
export const site = {
  url: "https://yuki666.online",
  momentsApi: "https://moments.yuki666.online",
  twikooApi: "https://twikoo.yuki666.online",
  music: {
    api: "https://music.yuki666.online/playlist?id=6677251084",
    urlApi: "https://music.yuki666.online/url",
  },
};
```

剩下的原则只有两条：

**1. 能提前建的连接就提前建。** 每个用到跨域接口的页面都加 `preconnect`：

```html
<link rel="preconnect" href="https://moments.yuki666.online" crossorigin />
```

国内访问 Cloudflare，一次 DNS + TLS 握手不便宜，提前建好能省掉一整个往返。

**2. 能晚加载的就晚加载。**

| 资源 | 什么时候加载 |
| --- | --- |
| 文章封面、相册缩略图 | `loading="lazy"`，进视口才下 |
| 评论 | 留言区快进视口时（提前 600px） |
| 歌单元数据 | 页面空闲时（`requestIdleCallback`） |
| 歌曲播放地址 | 点播放那一刻才去取 |
| 搜索索引 | 打开搜索页时才拉（10KB 左右） |

这些都不是"优化技巧"，而是**把一次性的成本摊到用户真正需要它的时刻**。

## 六、部署与运维

**部署**：主站是 `npm run deploy`（`astro build` + `wrangler deploy`），
后端各自 `npx wrangler deploy`。每个项目都有自己的 `wrangler.toml` 和 git 仓库。

**密钥**：不进仓库，用 secret 存：

```bash
npx wrangler secret put ADMIN_PASSWORD      # 动态发布密码
npx wrangler secret put NETEASE_COOKIE      # 网易云登录态
```

**回滚**：动主站之前先记下当前版本，出问题能退回去：

```bash
npx wrangler deployments list --name firefly
```

**看日志**：`npx wrangler tail` 能实时跟线上日志，比在代码里到处 `console.log` 再重新部署快得多。

**用线上资源调试**：`npx wrangler dev --remote` 让本地 Worker 直连线上 D1 与密钥，
上面那个 BLOB 问题就是这么定位的。注意它连的是**真实数据**，别在上面跑写操作。

## 七、代价与边界

这套架构不是没有成本：

- **多域名 = 多次握手**。国内访问 Cloudflare，每个子域都要单独建连。
  如果把它们合并进主站 Worker（同源路径 `/api/*`），能省掉这些握手——代价是耦合变紧、
  主站 Worker 从"纯静态"变成"有逻辑"，回滚粒度也变粗
- **跨境延迟绕不开**。Cloudflare 免费版没有国内节点，这是链路问题，不是代码问题；
  能做的只有"少请求、早预取、长缓存"
- **D1 不是对象存储**。几百 KB 的配图没问题，真要存几 MB 的图还是该上 R2

所以这套方案的适用边界很清楚：**个人站点、访问量不大、想要零服务器运维**。
再往上走（多人协作、复杂查询、大文件、真实国内加速），就该考虑换个形态了。

## 小结

一张表收个尾：

| 需求 | 方案 | 关键点 |
| --- | --- | --- |
| 托管静态站点 | Workers 静态资源 | `_headers` 缓存策略跟着代码走 |
| 存动态/评论 | D1 | 注意 BLOB 读出来是数字数组 |
| 存配图 | D1 BLOB + 前端压缩 | 900KB 上限，省掉 R2 |
| 接第三方接口 | 小 Worker 做代理 | 补 CORS、加缓存、换 https |
| 站内搜索 | 本地生成索引 + 纯前端搜索 | 索引提交进仓库，构建不依赖额外环境 |

静态站点不意味着"什么都没有"，而是**把后端拆成一个个刚好够用的小零件**，
每个都能单独部署、单独回滚、单独坏掉。

这套博客从主题、动态、评论、音乐到搜索都写完了，下一篇想聊点轻松的：
**我用过的几套静态站点方案对比**（Astro / Hugo / 纯手写），以及为什么最后留在了 Astro 喵。
