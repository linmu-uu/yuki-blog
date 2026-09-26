import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://yuki666.online",
	/*
	 * 预取分两层：
	 *   - Astro 自带的这层用 hover：鼠标碰上链接才抓目标页，点下去基本已经就绪；
	 *   - 整站预取交给 src/scripts/prefetch.ts（load 之后空闲时小并发自己抓）。
	 * 之前这里写的是 viewport：链接一进视口就抓，顶部导航等于页面刚打开就触发 8 个跨境请求，
	 * 直接跟首屏大图抢带宽（Lighthouse 手机预设下 LCP 被拖到 2.2s）。
	 */
	prefetch: {
		prefetchAll: true,
		defaultStrategy: "hover",
	},
	build: {
		inlineStylesheets: "auto",
	},
	markdown: {
		/*
		 * 代码块高亮走 Shiki。默认主题的注释色是 #6A737D，压在我们这块更深的 pre 背景上
		 * 对比度只有 4.07（低于 4.5 的 AA 线），Lighthouse 在文章页会判不合格；
		 * 换成高对比主题后代码块也满分。
		 */
		shikiConfig: {
			theme: "github-dark-high-contrast",
		},
	},
});
