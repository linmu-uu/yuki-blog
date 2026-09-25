/**
 * 每篇文章的分享卡片：/og/<slug>.jpg
 *
 * 构建时用 sharp 把 SVG 渲染成 1200×630 的 JPEG（微信/Twitter/Google 都认这个尺寸）。
 * 之前所有页面共用一张头像，贴链接出去看不出是哪篇；现在卡片上就是文章标题。
 *
 * 纯静态输出，所以这里返回的响应头没什么用（详见 HANDOFF 踩坑 10），
 * 线上 Content-Type 由 Cloudflare 按 `.jpg` 扩展名给。
 */
import { getCollection } from "astro:content";
import sharp from "sharp";
import { site } from "../../data/site";

export async function getStaticPaths() {
	const posts = await getCollection("posts", ({ data }) => !data.draft);
	return posts.map((post) => ({
		params: { slug: post.id.replace(/\.(md|mdx)$/, "") },
		props: {
			title: post.data.title,
			category: post.data.category ?? "",
			tags: (post.data.tags ?? []).slice(0, 3),
		},
	}));
}

const esc = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** 全角字符算 1 个单位，半角算 0.55 个单位 */
const unitWidth = (char: string) => (/[\u0000-\u00ff]/.test(char) ? 0.55 : 1);

/** 粗略折行：按"单位宽度"累加，超过 maxUnits 就断行 */
const wrap = (text: string, maxUnits: number) => {
	const lines: string[] = [];
	let line = "";
	let width = 0;
	for (const char of text) {
		const charWidth = unitWidth(char);
		if (width + charWidth > maxUnits && line) {
			lines.push(line);
			line = "";
			width = 0;
		}
		line += char;
		width += charWidth;
	}
	if (line) lines.push(line);
	return lines;
};

const FONT = "Microsoft YaHei, Noto Sans CJK SC, Source Han Sans SC, PingFang SC, sans-serif";

/** 文字从 x=96 开始，右边留够边距；字号越小每行能放的字越多 */
const TEXT_WIDTH = 1000;
const SIZES = [76, 70, 64, 58, 52, 46];

const fitTitle = (title: string) => {
	let fontSize = SIZES[SIZES.length - 1];
	let lines = wrap(title, TEXT_WIDTH / fontSize);

	for (const size of SIZES) {
		const candidate = wrap(title, TEXT_WIDTH / size);
		if (candidate.length <= 4) {
			return { fontSize: size, lines: candidate };
		}
		fontSize = size;
		lines = candidate;
	}

	// 最小的字号也放不下：保留四行，最后一行截断加省略号
	const kept = lines.slice(0, 4);
	const lastLine = kept[3] ?? "";
	kept[3] = `${lastLine.slice(0, Math.max(1, Math.floor(TEXT_WIDTH / fontSize) - 1))}…`;
	return { fontSize, lines: kept };
};

export async function GET({ props }: { props: { title: string; category: string; tags: string[] } }) {
	const { title, category, tags } = props;
	const { fontSize, lines: titleLines } = fitTitle(title);
	// 标题画在「装饰条下方 205 ~ 标签上方 470」这条带子里，行数多就自动压一点行距
	const ZONE_TOP = 205;
	const ZONE_BOTTOM = 470;
	const zoneHeight = ZONE_BOTTOM - ZONE_TOP;
	const lineHeight = Math.min(fontSize * 1.32, zoneHeight / titleLines.length);
	const firstBaseline =
		ZONE_TOP + zoneHeight / 2 - ((titleLines.length - 1) * lineHeight) / 2 + fontSize * 0.35;

	const titleSvg = titleLines
		.map(
			(line, index) =>
				`<text x="96" y="${(firstBaseline + index * lineHeight).toFixed(1)}" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="#f2f7ff">${esc(line)}</text>`,
		)
		.join("");

	const chips = [category, ...tags].filter(Boolean).slice(0, 4);
	const chipWidths = chips.map((chip) => chip.length * 15 + 36);
	let chipX = 96;
	const chipSvg = chips
		.map((chip, index) => {
			const width = chipWidths[index];
			const svg = `<g><rect x="${chipX}" y="486" width="${width}" height="44" rx="22" fill="#7fd8ff" fill-opacity="0.14" stroke="#7fd8ff" stroke-opacity="0.45"/><text x="${chipX + width / 2}" y="515" text-anchor="middle" font-family="${FONT}" font-size="22" fill="#bcd9ff">${esc(chip)}</text></g>`;
			chipX += width + 16;
			return svg;
		})
		.join("");

	const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#070d1c"/>
			<stop offset="0.55" stop-color="#0e2145"/>
			<stop offset="1" stop-color="#123a6b"/>
		</linearGradient>
		<radialGradient id="glow" cx="0.86" cy="0.12" r="0.75">
			<stop offset="0" stop-color="#5fd8ff" stop-opacity="0.42"/>
			<stop offset="1" stop-color="#5fd8ff" stop-opacity="0"/>
		</radialGradient>
	</defs>
	<rect width="1200" height="630" fill="url(#bg)"/>
	<rect width="1200" height="630" fill="url(#glow)"/>
	<rect x="96" y="176" width="72" height="8" rx="4" fill="#7fd8ff"/>
	${titleSvg}
	${chipSvg}
	<rect x="96" y="566" width="1008" height="2" rx="1" fill="#7fd8ff" fill-opacity="0.3"/>
	<text x="96" y="608" font-family="${FONT}" font-size="26" fill="#9fb6dd">${esc(site.title)} · ${esc(site.subtitle)}</text>
	<text x="1104" y="608" text-anchor="end" font-family="${FONT}" font-size="24" fill="#6f88b4">yuki666.online</text>
</svg>`;

	const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();

	return new Response(jpeg, {
		headers: {
			"Content-Type": "image/jpeg",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
