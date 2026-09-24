---
title: "给博客补上 RSS、站点地图和 404：静态站点的 SEO 基建"
published: 2026-09-24
description: "分享链接没有预览图、别人订阅不了、搜索引擎不知道该收哪些页、输错地址只看到 Cloudflare 的白板。这篇把静态站点最容易被跳过的那几件小事一次补齐，附三处真实踩坑。"
tags: [建站, SEO, Astro]
category: 建站笔记
draft: false
---

这个博客从主题到搜索都自己做，功能上看着挺全，但一直缺几样**没人会主动想起来**的东西：

把文章链接发到群里，只有一条光秃秃的 URL，没有标题也没有预览图；
想订阅的人找不到订阅入口；
爬虫拿到首页，但不知道站里到底有哪些页面；
地址打错一个字母，看到的是 Cloudflare 自带的白板 404。

这些加起来就是所谓的「SEO 基建」。它不影响你自己访问，但影响**别人能不能找到、愿不愿意点**。
这篇把这几件事一次补齐，代码都在仓库里，顺手记下三处踩坑。

## 这一轮加了什么

| 文件 | 作用 | 谁在用 |
| --- | --- | --- |
| `/rss.xml` | 全文订阅源 | 阅读器、订阅党 |
| `/sitemap.xml` | 页面清单 | 搜索引擎爬虫 |
| `/robots.txt` | 抓取规则 | 同上 |
| `og:` / `twitter:` meta | 分享卡片 | QQ、微信、Discord 的链接预览 |
| `canonical` | 规范地址 | 搜索引擎去重 |
| 自定义 404 页 | 走丢时的引导 | 手滑的访客 |

## 一、RSS：能全文就别只给摘要

自己搭静态站的第一个坑就是想太多：要不要上 `@astrojs/rss`？

结论是**不用**。那个包要额外装依赖，而这里需要的东西其实很少：把文章列表拼成一份
RSS 2.0 XML。Astro 的静态端点（`src/pages/x.xml.ts`）本身就是个导出 `GET` 的模块：

```ts
// src/pages/rss.xml.ts
export async function GET() {
  const posts = (await getCollection("posts", ({ data }) => !data.draft))
    .sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${site.url}/</link>
    <description>${escapeXml(site.description)}</description>
    <language>zh-CN</language>
    ${items.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
```

文章列表从内容集合里取，所以**以后写新文章不用回来改这个文件**——这也是
「能算出来的就别手写」的第一条。

### 全文输出：把 Markdown 渲染成 HTML 塞进 CDATA

RSS 的 `<description>` 只放摘要的话，读者点进去还是得回站内。全文输出体验好得多，
而渲染正文需要一个能在构建期跑组件的容器（`astro/container`）：

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getCollection, render } from "astro:content";

const container = await AstroContainer.create();

for (const post of posts) {
  const { Content } = await render(post);          // 拿到文章组件
  const html = await container.renderToString(Content);  // 渲染成 HTML 字符串
  // ...塞进 <content:encoded><![CDATA[...]]></content:encoded>
}
```

两个必须处理的小问题：

**1. `]]>` 会把 CDATA 区块提前关掉。** XML 里 `]]>` 就是 CDATA 的结束标记，
正文里真的出现这三个字符就会把文档搞坏，所以要拆成两段：

```ts
const cdata = (value: string) =>
  `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
```

**2. 站内链接要变成绝对地址。** 正文里的 `href="/posts/xxx/"` 在别人那个阅读器里
是没有意义的，得补上域名：

```ts
const absolutize = (html: string) =>
  html.replace(/(\s(?:src|href))="\/(?!\/)/g, `$1="${site.url}/`);
```

## 二、站点地图：固定页面手写，文章列表自动

`/sitemap.xml` 就是给别人（爬虫）看的一份页面清单。站里只有八个固定页面，
手写一份列表完全没问题，文章部分照样从集合里生成：

```ts
const staticPages = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/archive/", changefreq: "weekly", priority: "0.9" },
  // ...
];

for (const post of posts) {
  urls.push(`\t<url>
\t\t<loc>${site.url}/posts/${post.id.replace(/\.(md|mdx)$/, "")}/</loc>
\t\t<lastmod>${isoDate(post.data.updated ?? post.data.published)}</lastmod>
\t</url>`);
}
```

注意 `/admin/`（发布后台）**故意不收录**，`robots.txt` 里也一并挡掉：

```
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://yuki666.online/sitemap.xml
```

后台是给自己用的，被搜索引擎收录没有任何好处。

## 三、分享卡片：别让链接贴到群里变成光秃秃一行

这部分是纯 `<head>` 里的 meta，但有个**必须做对**的细节：`og:image` 只能是绝对地址。

```astro
const shareImage = new URL(image, site.url).href; // /avatar.avif -> https://yuki666.online/avatar.avif
---
<link rel="canonical" href={canonical} />
<meta property="og:site_name" content={site.title} />
<meta property="og:type" content={type} />          {/* 文章页传 article */}
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={shareImage} />
<meta name="twitter:card" content="summary_large_image" />
```

顺手把这三个值做成 `BaseLayout` 的 props（`image` / `type` / `canonical`），
文章页传 `type="article"`，封面存在 front-matter 里就用封面，没有就退回头像。

`canonical` 也值得给一个 `false` 的出口——404 页没有「规范地址」，
给它指派一个只会误导爬虫。

## 四、404 页：建了文件 ≠ 线上会用它

这一条最容易翻车。做了个挺好看的 404 页面，构建也确实产出了 `dist/404.html`，
但线上访问一个不存在的地址，看到的还是 Cloudflare 那张白板。

原因是 Workers 静态资源的默认行为是 `not_found_handling = "none"`：
**找不到的路径不会自动去找你的 404 页**。要在 `wrangler.toml` 里明说：

```toml
[assets]
directory = "./dist"
# 找不到的路径交给 dist/404.html，状态码仍然是 404（不会伪装成 200）
not_found_handling = "404-page"
```

还有一个容易忽略的点：**404 页要放在 `src/pages/404.astro`**（而不是 `public/404.html`），
这样它才走和其他页面一样的布局——导航、壁纸、配色变量都跟着站点主题走。

## 五、踩到的三个坑

### 坑一：静态端点里写的响应头会凭空消失

我在 `rss.xml.ts` 里老老实实写了：

```ts
return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
```

结果线上 `Content-Type` 是 `application/xml`。原因很简单：静态输出会把这个响应
**写成一个文件**，线上是 Cloudflare 的静态资源服务在发它，类型按扩展名决定
（`.xml` → `application/xml`）。代码里那行在构建期就被丢掉了。

同理，缓存策略也别写在端点里，要去 `public/_headers`：

```
/rss.xml
  Cache-Control: public, max-age=300
```

事实核查一下：`application/xml` 也完全能被阅读器识别，功能没问题。
但如果哪天你很在意那个精确的类型，得靠托管层配置，改代码是没用的。

### 坑二：视图过渡会把 XML 当页面抓回来

页脚加了两个订阅入口之后，点「RSS」会看到页面变成一堆 XML 源码。

因为站点开了视图过渡（`ClientRouter`），它拦截所有同源链接、走客户端路由，
把目标响应当成 HTML 文档去替换 DOM。给它一个 XML，它当然就懵了。

修法是给这类「不是 HTML 页面」的链接加个标记：

```astro
<a href="/rss.xml" data-astro-reload data-astro-prefetch="false">RSS</a>
```

- `data-astro-reload`：跳过客户端路由，交给浏览器正常打开
- `data-astro-prefetch="false"`：顺便别预取，省一次没意义的请求

### 坑三：写死的数字会烂掉

补基建的时候顺手发现，首页侧边栏的资料卡写着「3 篇文章 / 6 个标签」——
而站里已经有 9 篇了。数字是当初写死在 `src/data/site.ts` 里的，后来每次发文章
都忘了改。

改法不是把 3 改成 9，而是**让它自己算**：

```astro
const allPosts = await getCollection("posts", ({ data }) => !data.draft);
const postCount = allPosts.length;
const tagCount = new Set(allPosts.flatMap((post) => post.data.tags)).size;
```

凡是能从内容集合推出来的数字，就不要再手写一遍——手写的那个迟早会和现实对不上。
（同理，`site.ts` 里那份 `stats` 直接删掉了，免得下次又被谁捡起来用。）

## 六、上线核对清单

这几样东西都不在页面上，肉眼看不出来，所以每次都该用命令过一遍：

| 检查项 | 期望 |
| --- | --- |
| `curl -I https://yuki666.online/rss.xml` | `200`，`Content-Type: application/xml` |
| `/rss.xml` 里的 `<item>` 数量 | 等于已发布文章数 |
| `curl -I .../sitemap.xml` | `200`，条数 = 固定页 + 文章数 |
| `curl .../robots.txt` | 有 `Sitemap:` 那行 |
| 访问一个不存在的地址 | **状态码 404**，且页面是自己的样式 |
| 首页 HTML | 有 `og:image`、`canonical`、`rel="alternate"` |

最后一条特别值得强调：自定义 404 页**必须同时是 404 状态码**。
如果它返回 200，搜索引擎会把无数个错误地址当成正常页面收进去。

## 小结

这几件事有个共同点：**做完之后你自己什么都感觉不到**。

页面没变快，动效没变顺，但别人分享你的链接会有预览图，订阅党能追更，
爬虫知道站里有哪些页面，手滑打错地址的人会被好好引导回去。

静态站点的「静」不是省事，而是把该做的事提前做完、固化下来。
这次一共动了三百多行（大头是 404 页的样式），真正写逻辑的只有两个共一百多行的端点文件，
换来的是这站终于**能被别人正常发现和订阅**了。

下一步想折腾两件更花时间的：把背景音乐压到能省一半的码率（已经做了，936KB → 497KB），
以及试试用 ComfyUI 在本地画几张蔚蓝档案风格的壁纸喵。
