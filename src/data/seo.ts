/**
 * 结构化数据（JSON-LD）。
 *
 * 搜索引擎看不懂"页面长什么样"，但看得懂 JSON-LD，靠它决定：
 *   - 首页：`WebSite` —— 站点名称、语言，以及站内搜索框（`SearchAction`）
 *   - 文章页：`BlogPosting` —— 标题、作者、发布时间、关键词、正文分类
 *   - 文章页：`BreadcrumbList` —— 面包屑（结果里会显示层级路径）
 *   - 两者都引用同一个 `Person`（作者）与 `Organization`（站点）
 *
 * 序列化时把 `<` 转义成 `\u003c`：万一标题里出现 `</script>`，
 * 浏览器会提前把标签闭合，整页脚本都乱掉。
 */
import { site } from "./site";

const abs = (path: string) => new URL(path, site.url).href;

const serialize = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** 文章 id（`foo.md`）→ 绝对地址 */
export const postUrl = (id: string) => abs(`/posts/${id.replace(/\.(md|mdx)$/, "")}/`);

export function authorSchema() {
	return {
		"@type": "Person",
		"@id": `${site.url}/#author`,
		name: site.author,
		url: site.url,
		image: abs(site.avatar),
	};
}

export function publisherSchema() {
	return {
		"@type": "Organization",
		"@id": `${site.url}/#publisher`,
		name: site.title,
		url: `${site.url}/`,
		logo: {
			"@type": "ImageObject",
			url: abs(site.avatar),
		},
	};
}

/** 首页用：WebSite + 作者/站点实体 */
export function websiteSchemas(): string[] {
	const website = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${site.url}/#website`,
		name: site.title,
		alternateName: `${site.title} - ${site.subtitle}`,
		description: site.description,
		url: `${site.url}/`,
		inLanguage: "zh-CN",
		publisher: publisherSchema(),
		author: authorSchema(),
		// 站内搜索页吃 ?q=（src/pages/search.astro），所以这里可以声明搜索框
		potentialAction: {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: `${site.url}/search/?q={search_term_string}`,
			},
			"query-input": "required name=search_term_string",
		},
	};

	return [serialize(website)];
}

export interface PostLike {
	id: string;
	data: {
		title: string;
		description?: string;
		published: Date;
		updated?: Date;
		tags?: string[];
		category?: string;
	};
}

/** 文章页用：BlogPosting + BreadcrumbList */
export function postSchemas(post: PostLike, image: string): string[] {
	const url = postUrl(post.id);
	const { title, description = "", published, updated, tags = [], category = "" } = post.data;
	const modified = updated ?? published;

	const blogPosting = {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		"@id": `${url}#article`,
		headline: title,
		name: title,
		description,
		url,
		mainEntityOfPage: { "@type": "WebPage", "@id": url },
		datePublished: published.toISOString(),
		dateModified: modified.toISOString(),
		inLanguage: "zh-CN",
		author: authorSchema(),
		publisher: publisherSchema(),
		image: abs(image),
		isPartOf: { "@id": `${site.url}/#website` },
		...(category ? { articleSection: category } : {}),
		...(tags.length ? { keywords: tags.join(", ") } : {}),
	};

	const breadcrumb = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "首页", item: `${site.url}/` },
			{ "@type": "ListItem", position: 2, name: "文章归档", item: abs("/archive/") },
			{ "@type": "ListItem", position: 3, name: title, item: url },
		],
	};

	return [serialize(blogPosting), serialize(breadcrumb)];
}
