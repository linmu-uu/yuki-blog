/**
 * 标签页（`/tags/<标签>/`）的公共逻辑。
 *
 * 为什么要有独立标签页：以前标签云和文章页上的标签都指向 `/archive?tag=xxx`，
 * 那只是个「带查询串的过滤器」，对搜索引擎来说不存在「每个标签一个页面」这件事，
 * 「Lua 踩坑」「Astro 建站」这类长尾组合词就白丢了。现在每个标签都有自己的路径、
 * 标题和描述，也会进 sitemap。
 *
 * URL 直接用中文（浏览器/爬虫自己会做百分号编码）：
 *   1. 中文标签本身对中文长尾搜索是加分项；
 *   2. 不用维护一张「标签 → 拼音」的字典 —— 以后加新标签不会再漏改一处。
 */
import type { CollectionEntry } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

/** 文章 id（`foo.md`）→ 站内地址 */
export const postHref = (id: string) => `/posts/${id.replace(/\.(md|mdx)$/, "")}/`;

/** 标签 → 标签页地址 */
export const tagHref = (tag: string) => `/tags/${encodeURIComponent(tag)}/`;

export interface TagCount {
	name: string;
	count: number;
}

/** 统计每个标签有多少篇文章；次数多的在前，同次数按名称排 */
export function collectTags(posts: PostEntry[]): TagCount[] {
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

/** 某个标签下的文章（调用方保证 posts 已按时间倒序） */
export const postsWithTag = (posts: PostEntry[], tag: string) =>
	posts.filter((post) => post.data.tags.includes(tag));

/** 一组文章里最新的一天，给聚合页当 sitemap 的 lastmod 用 */
export function latestDate(posts: PostEntry[]): Date | undefined {
	return posts.reduce<Date | undefined>((newest, post) => {
		const date = post.data.updated ?? post.data.published;
		return !newest || date > newest ? date : newest;
	}, undefined);
}
