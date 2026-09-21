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
		defaultStrategy: "hover",
	},
	build: {
		inlineStylesheets: "auto",
	},
});
