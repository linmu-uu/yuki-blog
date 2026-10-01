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

/**
 * 聚合页（标签索引 `/tags/`、单个标签 `/tags/<标签>/`）用：
 * `CollectionPage` + 里面装一份 `ItemList`，再加 `BreadcrumbList`。
 *
 * 为什么要专门写 ItemList：Google 看到「一个页面列了一串同类文章」时，
 * 靠 ItemList 才知道这是列表页而不是普通正文，长尾结果里更容易被选成落地页。
 */
export function collectionSchemas(config: {
	/** 站内路径，比如 "/tags/" 或 "/tags/%E5%BB%BA%E7%AB%99/" */
	path: string;
	/** 页面名（也是面包屑最后一节的文字） */
	name: string;
	/** 面包屑最后一节的文字。不写就跟 name 一样；页面标题和面包屑措辞不同时才需要（比如标签页 h1 是「#建站」，页面名是「标签：建站」） */
	crumbName?: string;
	description: string;
	/** 面包屑中间层（不含首页和当前页），比如 [{ name: "标签", path: "/tags/" }] */
	trail?: { name: string; path: string }[];
	/** 列表项：文章标题 + 绝对地址 */
	items: { name: string; url: string }[];
}): string[] {
	const url = abs(config.path);

	const collection = {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${url}#collection`,
		name: config.name,
		description: config.description,
		url,
		inLanguage: "zh-CN",
		isPartOf: { "@id": `${site.url}/#website` },
		author: authorSchema(),
		publisher: publisherSchema(),
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: config.items.length,
			itemListElement: config.items.map((item, index) => ({
				"@type": "ListItem",
				position: index + 1,
				name: item.name,
				url: item.url,
			})),
		},
	};

	const crumbs = [
		{ name: "首页", item: `${site.url}/` },
		...(config.trail ?? []).map((step) => ({ name: step.name, item: abs(step.path) })),
		/*
		 * 面包屑最后一节要和页面上看得见的那一条对得上（Google 会拿两边对，
		 * 对不上可能整条结构化数据都不显示），所以这里允许单独指定措辞。
		 */
		{ name: config.crumbName ?? config.name, item: url },
	];

	const breadcrumb = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: crumbs.map((crumb, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: crumb.name,
			item: crumb.item,
		})),
	};

	return [serialize(collection), serialize(breadcrumb)];
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
