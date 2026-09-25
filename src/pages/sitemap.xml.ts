import { getCollection } from "astro:content";
import { site } from "../data/site";

/*
 * 站点地图：/sitemap.xml
 *
 * 固定页面手写一份，文章列表从内容集合里取 —— 加了新文章不用回来改这个文件。
 * /admin/ 故意不收录（它是发布后台，robots.txt 里也挡了）。
 *
 * lastmod：文章用自己的 published/updated；归档、标签这类聚合页用「最新一篇文章的日期」，
 * 比无脑写当天时间诚实（爬虫也会参考这个字段决定要不要重抓）。
 */

const staticPages: { path: string; changefreq: string; priority: string; aggregate?: boolean }[] = [
	{ path: "/", changefreq: "daily", priority: "1.0", aggregate: true },
	{ path: "/archive/", changefreq: "weekly", priority: "0.9", aggregate: true },
	{ path: "/moments/", changefreq: "daily", priority: "0.8" },
	{ path: "/gallery/", changefreq: "weekly", priority: "0.7" },
	{ path: "/search/", changefreq: "monthly", priority: "0.5" },
	{ path: "/friends/", changefreq: "monthly", priority: "0.6" },
	{ path: "/guestbook/", changefreq: "weekly", priority: "0.6" },
	{ path: "/about/", changefreq: "monthly", priority: "0.6" },
];

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export async function GET() {
	const posts = (await getCollection("posts", ({ data }) => !data.draft)).sort(
		(a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
	);

	// 最新一篇文章的日期，给聚合页当 lastmod
	const latest = posts.reduce(
		(newest, post) => {
			const date = post.data.updated ?? post.data.published;
			return date > newest ? date : newest;
		},
		new Date(0),
	);
	const latestIso = posts.length ? isoDate(latest) : undefined;

	const urls: string[] = staticPages.map((page) => {
		const lastmod = page.aggregate && latestIso ? `\n\t\t<lastmod>${latestIso}</lastmod>` : "";
		return `\t<url>\n\t\t<loc>${site.url}${page.path}</loc>${lastmod}\n\t\t<changefreq>${page.changefreq}</changefreq>\n\t\t<priority>${page.priority}</priority>\n\t</url>`;
	});

	for (const post of posts) {
		const slug = post.id.replace(/\.(md|mdx)$/, "");
		const loc = `${site.url}/posts/${slug}/`;
		const lastmod = isoDate(post.data.updated ?? post.data.published);
		const image = post.data.image ? `${site.url}${post.data.image}` : `${site.url}/og/${slug}.jpg`;
		urls.push(
			[
				"\t<url>",
				`\t\t<loc>${loc}</loc>`,
				`\t\t<lastmod>${lastmod}</lastmod>`,
				"\t\t<changefreq>monthly</changefreq>",
				"\t\t<priority>0.8</priority>",
				// 图片扩展：让搜索引擎知道每篇文章的配图/分享卡片
				"\t\t<image:image>",
				`\t\t\t<image:loc>${image}</image:loc>`,
				`\t\t\t<image:title>${escapeXml(post.data.title)}</image:title>`,
				"\t\t</image:image>",
				"\t</url>",
			].join("\n"),
		);
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	});
}

function escapeXml(text: string) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
