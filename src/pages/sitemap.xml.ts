import { getCollection } from "astro:content";
import { site } from "../data/site";

/*
 * 站点地图：/sitemap.xml
 *
 * 固定页面手写一份，文章列表从内容集合里取 —— 加了新文章不用回来改这个文件。
 * /admin/ 故意不收录（它是发布后台，robots.txt 里也挡了）。
 */

const staticPages: { path: string; changefreq: string; priority: string }[] = [
	{ path: "/", changefreq: "daily", priority: "1.0" },
	{ path: "/archive/", changefreq: "weekly", priority: "0.9" },
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

	const urls: string[] = staticPages.map(
		(page) =>
			`\t<url>\n\t\t<loc>${site.url}${page.path}</loc>\n\t\t<changefreq>${page.changefreq}</changefreq>\n\t\t<priority>${page.priority}</priority>\n\t</url>`,
	);

	for (const post of posts) {
		const loc = `${site.url}/posts/${post.id.replace(/\.(md|mdx)$/, "")}/`;
		const lastmod = isoDate(post.data.updated ?? post.data.published);
		urls.push(
			`\t<url>\n\t\t<loc>${loc}</loc>\n\t\t<lastmod>${lastmod}</lastmod>\n\t\t<changefreq>monthly</changefreq>\n\t\t<priority>0.8</priority>\n\t</url>`,
		);
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	});
}
