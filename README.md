# Yuki的小窝

蔚蓝档案风格的静态博客（Astro），部署在 Cloudflare Workers 静态资源上。
线上地址：https://yuki666.online

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发预览（http://127.0.0.1:4321） |
| `npm run build` | 构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run deploy` | 构建 + 部署到 Cloudflare（`wrangler deploy`） |
| `npm run admin` | 本地发布后台（不联网也能发动态） |
| `npm run wallpapers:import` | 从 `D:/wallpapers` 导入壁纸（压成 AVIF，同时出桌面版和手机版） |
| `npm run wallpapers:palette` | 重新分析壁纸主色，生成 `src/data/wallpaper-palettes.json` |
| `npm run wallpapers:variants` | 生成 1600px 的壁纸小图（配合 `srcset` 按屏幕挑图） |
| `npm run wallpapers:generate` | 生成程序绘制的渐变壁纸（备用，默认不进轮换） |
| `npm run gallery:thumbs` | 生成相册缩略图（网格用小图，点开仍是原图） |

> 壁纸轮换只收 `ba-*`（自己找的图，放在 `D:/wallpapers` 后跑 `wallpapers:import` 导入）。
> 程序生成的 `orig-*` 与早期的 `schale / millennium / halo / trinity` 都没有二次元人物，
> 已移出轮换；想启用就改 `src/data/background.ts` 里的 `ALLOWED_PREFIXES`。

## 目录结构

```
src/
  components/   卡片、头部、页脚、加载遮罩、花瓣层等
  data/         站点配置、壁纸清单与调色板、相册、友链、动态种子数据
  layouts/      BaseLayout（含壁纸随机挑选与主题色注入）
  pages/        首页/文章/动态/相册/友链/留言/关于/发布页
  scripts/      壁纸轮换、动效、打字机等浏览器端脚本
  styles/       设计令牌、全局样式、正文排版
public/
  assets/       Twikoo 前端资源
  audio/        背景音乐
  gallery/      相册原图与 *-thumb.avif 缩略图
  wallpaper/    壁纸（desktop/ 与 mobile/，另有 *-1600.avif 小图）
```

## 后端

- **动态**：Cloudflare Worker + D1，代码在 `../yuki-moments`，域名 `moments.yuki666.online`。
  发布用密码存在 Worker secret（`ADMIN_PASSWORD`），前端发布页是 `/admin`。
- **评论**：自建 Twikoo，域名 `twikoo.yuki666.online`，页面滚到留言区才懒加载。

## 部署

站点是纯静态产物，交给 Cloudflare Workers 静态资源托管：

```bash
npm run deploy
```

缓存策略写在 `public/_headers`（构建产物缓存一年、图片/音频一天、HTML 不缓存）。
