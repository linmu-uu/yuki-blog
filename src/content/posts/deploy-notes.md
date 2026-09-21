---
title: 把静态博客部署到 Cloudflare
published: 2026-09-15
description: Workers 静态资源的部署流程，以及踩过的缓存坑。
tags: [部署, Cloudflare, 运维]
category: 技术
draft: false
---

静态站点部署到 Cloudflare 有两种形态：Pages 和 Workers 静态资源。我用的是后者。

## 关键一步：缓存头

默认情况下，所有静态资源都返回 `Cache-Control: public, max-age=0, must-revalidate`，意味着每次访问浏览器都要重新确认一遍。

带内容哈希的文件名（比如 `_astro/xxx.abc123.js`）内容永不改变，可以放心缓存一年：

```text
/_astro/*
  Cache-Control: public, max-age=31556952, immutable
```

## 另一个坑

删文章之后构建会失败，报 `ImageNotFound`。原因是 Astro 的内容缓存里还留着已删文章的数据，构建前清掉 `.astro` 和 `node_modules/.astro` 就好了。
