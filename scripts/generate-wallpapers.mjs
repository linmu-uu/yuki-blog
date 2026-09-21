/**
 * 生成 4K 原创壁纸（蔚蓝档案风格的渐变 / 光环 / 星点）
 *
 * 全部用 SVG 程序化绘制，不含任何第三方素材，版权干净、可商用。
 * 用法：npm run wallpapers
 * 输出：public/wallpaper/desktop/*.avif（3840x2160）
 *      public/wallpaper/mobile/*.avif（2160x3840）
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DESKTOP = path.resolve("public/wallpaper/desktop");
const OUT_MOBILE = path.resolve("public/wallpaper/mobile");

/** 主题定义：底色 → 主光 → 辅光 → 光环色 */
const themes = [
	{ id: "schale", base: ["#071228", "#03060f"], main: "#128afa", soft: "#5fe1ff", halo: "#cdeaff" },
	{ id: "millennium", base: ["#050c1f", "#03050d"], main: "#2f6bff", soft: "#8ce6ff", halo: "#bcd6ff" },
	{ id: "halo", base: ["#0a1730", "#040711"], main: "#1e5fd0", soft: "#ffe08a", halo: "#fff0c2" },
	{ id: "trinity", base: ["#0b1730", "#050a16"], main: "#3b9bff", soft: "#cdeaff", halo: "#ffffff" },
];

/** 固定种子的伪随机，保证每次生成结果一致 */
function mulberry32(seed) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function sparklePath(cx, cy, r) {
	const k = r * 0.22;
	return `M${cx} ${cy - r}C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy}
	C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r}
	C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy}
	C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

function buildSvg(theme, width, height, seed) {
	const random = mulberry32(seed);
	const short = Math.min(width, height);
	const long = Math.max(width, height);

	// 光斑
	const blobs = [
		{ cx: width * 0.18, cy: height * 0.2, r: long * 0.52, color: theme.main, opacity: 0.5 },
		{ cx: width * 0.88, cy: height * 0.16, r: long * 0.42, color: theme.soft, opacity: 0.34 },
		{ cx: width * 0.62, cy: height * 0.92, r: long * 0.5, color: theme.main, opacity: 0.3 },
		{ cx: width * 0.36, cy: height * 0.62, r: long * 0.3, color: theme.halo, opacity: 0.12 },
	];

	// 光环圆环
	const rings = [
		{ cx: width * 0.72, cy: height * 0.42, r: short * 0.3, width: 2.4, opacity: 0.34, dash: "" },
		{ cx: width * 0.72, cy: height * 0.42, r: short * 0.2, width: 1.6, opacity: 0.26, dash: "18 26" },
		{ cx: width * 0.26, cy: height * 0.74, r: short * 0.18, width: 2, opacity: 0.22, dash: "10 18" },
	];

	// 星点
	let sparkles = "";
	for (let i = 0; i < 46; i += 1) {
		const x = random() * width;
		const y = random() * height;
		const r = 4 + random() * 16;
		const opacity = 0.2 + random() * 0.6;
		const color = random() > 0.72 ? theme.halo : theme.soft;
		sparkles += `<path d="${sparklePath(x, y, r)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`;
	}

	const blobSvg = blobs
		.map(
			(blob, index) => `
		<radialGradient id="blob${index}" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="${blob.color}" stop-opacity="${blob.opacity}"/>
			<stop offset="55%" stop-color="${blob.color}" stop-opacity="${(blob.opacity * 0.35).toFixed(3)}"/>
			<stop offset="100%" stop-color="${blob.color}" stop-opacity="0"/>
		</radialGradient>`,
		)
		.join("");

	const blobRects = blobs
		.map(
			(blob, index) =>
				`<circle cx="${blob.cx.toFixed(1)}" cy="${blob.cy.toFixed(1)}" r="${blob.r.toFixed(1)}" fill="url(#blob${index})"/>`,
		)
		.join("");

	const ringSvg = rings
		.map(
			(ring) =>
				`<circle cx="${ring.cx.toFixed(1)}" cy="${ring.cy.toFixed(1)}" r="${ring.r.toFixed(1)}"
					fill="none" stroke="${theme.halo}" stroke-opacity="${ring.opacity}" stroke-width="${ring.width}"
					${ring.dash ? `stroke-dasharray="${ring.dash}"` : ""}/>`,
		)
		.join("");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<defs>
		<linearGradient id="base" x1="0" y1="0" x2="0.25" y2="1">
			<stop offset="0%" stop-color="${theme.base[0]}"/>
			<stop offset="100%" stop-color="${theme.base[1]}"/>
		</linearGradient>
		<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="${theme.soft}" stop-opacity="0"/>
			<stop offset="50%" stop-color="${theme.soft}" stop-opacity="0.14"/>
			<stop offset="100%" stop-color="${theme.soft}" stop-opacity="0"/>
		</linearGradient>
		<linearGradient id="hallow" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="${theme.halo}" stop-opacity="0.85"/>
			<stop offset="55%" stop-color="${theme.soft}" stop-opacity="0.5"/>
			<stop offset="100%" stop-color="${theme.halo}" stop-opacity="0.1"/>
		</linearGradient>
		<pattern id="stripes" width="86" height="86" patternUnits="userSpaceOnUse" patternTransform="rotate(112)">
			<line x1="0" y1="0" x2="0" y2="86" stroke="${theme.soft}" stroke-opacity="0.07" stroke-width="2"/>
		</pattern>
		<radialGradient id="vignette" cx="50%" cy="45%" r="72%">
			<stop offset="55%" stop-color="#000" stop-opacity="0"/>
			<stop offset="100%" stop-color="#000" stop-opacity="0.72"/>
		</radialGradient>
		${blobSvg}
	</defs>

	<rect width="${width}" height="${height}" fill="url(#base)"/>
	${blobRects}
	<rect width="${width}" height="${height}" fill="url(#stripes)"/>
	<rect x="0" y="${(height * 0.52).toFixed(0)}" width="${width}" height="${(height * 0.16).toFixed(0)}" fill="url(#beam)"/>
	<!-- 主体光环：一道粗弧，像角色头顶的光环 -->
	<circle cx="${(width * 0.3).toFixed(0)}" cy="${(height * 0.3).toFixed(0)}" r="${(short * 0.22).toFixed(0)}"
		fill="none" stroke="url(#hallow)" stroke-width="${(short * 0.012).toFixed(1)}" stroke-linecap="round"
		stroke-dasharray="${(short * 0.9).toFixed(0)} ${(short * 0.5).toFixed(0)}" opacity="0.75"/>
	${ringSvg}
	${sparkles}
	<rect width="${width}" height="${height}" fill="url(#vignette)"/>
</svg>`;
}

async function render(theme, width, height, outDir, suffix) {
	await mkdir(outDir, { recursive: true });
	const seed = theme.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 7) + width;
	const svg = buildSvg(theme, width, height, seed);
	const file = path.join(outDir, `${theme.id}.avif`);
	const buffer = await sharp(Buffer.from(svg)).avif({ quality: 58, effort: 4 }).toBuffer();
	await sharp(buffer).toFile(file);

	// 顺便导出同尺寸的 JPEG 预览，方便直接拿去看/当手机壁纸
	if (suffix) {
		await sharp(Buffer.from(svg))
			.jpeg({ quality: 88 })
			.toFile(path.join(outDir, `${theme.id}.jpg`));
	}

	const { size } = await sharp(file).metadata().then(() => ({ size: buffer.length }));
	return { file, size };
}

const targets = [
	{ width: 3840, height: 2160, dir: OUT_DESKTOP, label: "桌面 4K" },
	{ width: 2160, height: 3840, dir: OUT_MOBILE, label: "手机 4K" },
];

for (const target of targets) {
	for (const theme of themes) {
		const { file, size } = await render(theme, target.width, target.height, target.dir, true);
		console.log(
			`${target.label}  ${theme.id.padEnd(12)} ${(size / 1024).toFixed(0)} KB  ${path.relative(process.cwd(), file)}`,
		);
	}
}

console.log("\n全部生成完毕喵～");
