import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://yuki666.online",
	/*
	 * 预取：鼠标移到导航/链接上（或链接进入视口）时，提前把目标页面的 HTML 抓回来。
	 * Astro 的 ClientRouter 会直接复用这份预取结果，切换栏目基本就是「瞬间换」，
	 * 不会再出现点一下先卡半秒的情况。
	 */
	prefetch: {
		prefetchAll: true,
		/* 链接一进入视口就预取：顶部导航永远在视口里，等于页面一加载就把栏目页拿到手，
		   点过去几乎不用等 —— 这是「不卡」最有效的一招 */
		defaultStrategy: "viewport",
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
