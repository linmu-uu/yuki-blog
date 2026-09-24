import { getCollection, render } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { site } from "../data/site";

/*
 * 站内 RSS：/rss.xml
 *
 * 为什么不用 @astrojs/rss：那个包要额外装依赖，而这里要的东西不多 —— 把文章列表
 * 拼成一份 RSS 2.0 XML 就够了。正文用 <content:encoded> 放全文，订阅器里能直接读完，
 * 不用再点回站内。
 */

const escapeXml = (value: string) =>
	value.replace(
		/[<>&'"]/g,
		(char) =>
			({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char,
	);

/** CDATA 里出现 "]]>" 会把区块提前关掉，得拆成两段 */
const cdata = (value: string) => `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** 正文里的站内链接改成绝对地址，不然订阅器里点不动 */
const absolutize = (html: string) =>
	html
		.replace(/(\s(?:src|href))="\/(?!\/)/g, `$1="${site.url}/`)
		.replace(/(\s(?:src|href))="\.\//g, `$1="${site.url}/`);

export async function GET() {
	const posts = (await getCollection("posts", ({ data }) => !data.draft)).sort(
		(a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
	);

	const container = await AstroContainer.create();
	const href = (id: string) => `${site.url}/posts/${id.replace(/\.(md|mdx)$/, "")}/`;

	const items: string[] = [];
	for (const post of posts) {
		const { Content } = await render(post);
		const html = absolutize(await container.renderToString(Content));
		const link = href(post.id);

		items.push(
			[
				"\t\t<item>",
				`\t\t\t<title>${escapeXml(post.data.title)}</title>`,
				`\t\t\t<link>${escapeXml(link)}</link>`,
				`\t\t\t<guid isPermaLink="true">${escapeXml(link)}</guid>`,
				`\t\t\t<pubDate>${post.data.published.toUTCString()}</pubDate>`,
				post.data.description
					? `\t\t\t<description>${escapeXml(post.data.description)}</description>`
					: "",
				post.data.category ? `\t\t\t<category>${escapeXml(post.data.category)}</category>` : "",
				...post.data.tags.map((tag) => `\t\t\t<category>${escapeXml(tag)}</category>`),
				`\t\t\t<content:encoded>${cdata(html)}</content:encoded>`,
				"\t\t</item>",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	const lastBuild = (posts[0]?.data.published ?? new Date()).toUTCString();

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
	<channel>
		<title>${escapeXml(site.title)}</title>
		<link>${site.url}/</link>
		<description>${escapeXml(site.description)}</description>
		<language>zh-CN</language>
		<lastBuildDate>${lastBuild}</lastBuildDate>
		<generator>Astro</generator>
		<atom:link href="${site.url}/rss.xml" rel="self" type="application/rss+xml" />
${items.join("\n")}
	</channel>
</rss>
`;

	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
		},
	});
}
