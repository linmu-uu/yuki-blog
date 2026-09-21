/**
 * 生成一批「蔚蓝档案风」的原创壁纸（纯程序绘制，零版权风险）。
 *
 * 和 scripts/generate-wallpapers.mjs 的区别：
 *   - 那套是早期的 4 张预设（schale / millennium / halo / trinity）
 *   - 这套按「配色主题 × 构图母题」批量生成，用来把壁纸池做大
 *
 * 每张同时输出三种尺寸：
 *   public/wallpaper/desktop/orig-desktop-NN.avif        2560 宽（2K 屏）
 *   public/wallpaper/desktop/orig-desktop-NN-1600.avif   1600 宽（1080p/1440p，省流量）
 *   public/wallpaper/mobile/orig-mobile-NN.avif          1080×1920 竖版
 *
 * 注意：生成的壁纸**默认不进轮换**。轮换只收 ba-*（npm run wallpapers:import 导入的图），
 * 因为这些渐变图里没有二次元人物，主人明确不要它们当背景。
 * 想让它们重新上台，把 src/data/background.ts 里的 ALLOWED_PREFIXES 加上 "orig-" 即可。
 *
 * 用法：npm run wallpapers:generate
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DESKTOP = path.resolve("public/wallpaper/desktop");
const OUT_MOBILE = path.resolve("public/wallpaper/mobile");
const DESKTOP = { width: 2560, height: 1440 };
const SMALL = { width: 1600 };
const MOBILE = { width: 1080, height: 1920 };
const QUALITY = 60;

/** 配色主题：底色 → 主光 → 辅光 → 点缀（光环色） */
const THEMES = [
	{ id: "azure", base: ["#08152e", "#03060f"], main: "#2f8cf0", soft: "#7fd8ff", accent: "#cdeaff", motif: "glow" },
	{ id: "cerulean", base: ["#061424", "#02060d"], main: "#1fa7d8", soft: "#8be8ff", accent: "#e6fbff", motif: "rings" },
	{ id: "cobalt", base: ["#060f26", "#02040d"], main: "#2b5df0", soft: "#8fb4ff", accent: "#dce6ff", motif: "grid" },
	{ id: "indigo", base: ["#080b22", "#03040f"], main: "#3b46d8", soft: "#8f9bff", accent: "#d9dcff", motif: "glow" },
	{ id: "violet", base: ["#0c0a24", "#04030f"], main: "#6a52e8", soft: "#b79bff", accent: "#e8dcff", motif: "bokeh" },
	{ id: "periwinkle", base: ["#0a1230", "#040613"], main: "#5f78e8", soft: "#a8b8ff", accent: "#dfe6ff", motif: "rings" },
	{ id: "aqua", base: ["#04161f", "#02070c"], main: "#12b6c9", soft: "#7ff0e6", accent: "#ddfffa", motif: "wave" },
	{ id: "ice", base: ["#0a1a2e", "#04080f"], main: "#3fa8e0", soft: "#c4ecff", accent: "#ffffff", motif: "bokeh" },
	{ id: "steel", base: ["#0a1220", "#03060d"], main: "#4a7fb5", soft: "#9dc4e6", accent: "#e2eefb", motif: "grid" },
	{ id: "dusk", base: ["#120c26", "#05030f"], main: "#7a58d8", soft: "#d59bff", accent: "#ffe0f5", motif: "wave" },
	{ id: "halogold", base: ["#0a1630", "#040610"], main: "#2f7ad8", soft: "#ffd98a", accent: "#fff3cf", motif: "rings" },
	{ id: "blossom", base: ["#0d0f26", "#04040f"], main: "#4b6ae0", soft: "#ff9fd0", accent: "#ffe4f1", motif: "bokeh" },
];

/** 固定种子的伪随机：同样的输入永远画出同样的图 */
function mulberry32(seed) {
	return () => {
		let t = (seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), 1 | t);
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

	// 大块柔光：位置随主题变化，保证每张构图不一样
	const blobs = [
		{ cx: width * (0.12 + random() * 0.2), cy: height * (0.12 + random() * 0.2), r: long * 0.52, color: theme.main, opacity: 0.5 },
		{ cx: width * (0.7 + random() * 0.25), cy: height * (0.1 + random() * 0.3), r: long * 0.42, color: theme.soft, opacity: 0.32 },
		{ cx: width * (0.45 + random() * 0.3), cy: height * (0.8 + random() * 0.2), r: long * 0.5, color: theme.main, opacity: 0.28 },
		{ cx: width * (0.2 + random() * 0.6), cy: height * (0.4 + random() * 0.3), r: long * 0.3, color: theme.accent, opacity: 0.12 },
	];

	let motifSvg = "";

	if (theme.motif === "rings") {
		const cx = width * (0.62 + random() * 0.16);
		const cy = height * (0.34 + random() * 0.18);
		motifSvg += `
			<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(short * 0.3).toFixed(0)}" fill="none"
				stroke="${theme.accent}" stroke-opacity="0.3" stroke-width="2.4"/>
			<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(short * 0.21).toFixed(0)}" fill="none"
				stroke="${theme.soft}" stroke-opacity="0.26" stroke-width="1.6" stroke-dasharray="18 26"/>
			<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(short * 0.12).toFixed(0)}" fill="none"
				stroke="${theme.accent}" stroke-opacity="0.2" stroke-width="1.2" stroke-dasharray="6 14"/>`;
	}

	if (theme.motif === "grid") {
		motifSvg += `
			<g opacity="0.28" stroke="${theme.soft}" stroke-width="1">
				${Array.from({ length: 14 }, (_, i) => `<line x1="${(i * width) / 13}" y1="0" x2="${(i * width) / 13}" y2="${height}"/>`).join("")}
				${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${(i * height) / 8}" x2="${width}" y2="${(i * height) / 8}"/>`).join("")}
			</g>
			<g opacity="0.5">
				${Array.from({ length: 7 }, () => {
					const x = random() * width;
					const y = random() * height;
					return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + random() * 5).toFixed(1)}" fill="${theme.accent}"/>`;
				}).join("")}
			</g>`;
	}

	if (theme.motif === "bokeh") {
		motifSvg += `<g>${Array.from({ length: 26 }, () => {
			const x = random() * width;
			const y = random() * height;
			const r = short * (0.03 + random() * 0.12);
			const color = random() > 0.5 ? theme.soft : theme.accent;
			return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="${(0.05 + random() * 0.12).toFixed(3)}"/>`;
		}).join("")}</g>`;
	}

	if (theme.motif === "wave") {
		const y1 = height * (0.68 + random() * 0.08);
		const y2 = height * (0.82 + random() * 0.08);
		motifSvg += `
			<path d="M0 ${y1.toFixed(0)} C ${(width * 0.25).toFixed(0)} ${(y1 - height * 0.16).toFixed(0)}, ${(width * 0.6).toFixed(0)} ${(y1 + height * 0.14).toFixed(0)}, ${width} ${(y1 - height * 0.05).toFixed(0)} L ${width} ${height} L 0 ${height} Z"
				fill="${theme.main}" opacity="0.26"/>
			<path d="M0 ${y2.toFixed(0)} C ${(width * 0.3).toFixed(0)} ${(y2 + height * 0.12).toFixed(0)}, ${(width * 0.65).toFixed(0)} ${(y2 - height * 0.12).toFixed(0)}, ${width} ${(y2 + height * 0.04).toFixed(0)} L ${width} ${height} L 0 ${height} Z"
				fill="${theme.soft}" opacity="0.18"/>`;
	}

	// 星点
	let sparkles = "";
	const sparkleCount = theme.motif === "bokeh" ? 26 : 46;
	for (let i = 0; i < sparkleCount; i += 1) {
		const x = random() * width;
		const y = random() * height;
		const r = 4 + random() * 16;
		const opacity = 0.18 + random() * 0.55;
		const color = random() > 0.72 ? theme.accent : theme.soft;
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

	// 主体光环：像角色头顶那圈光
	const halo = {
		cx: width * (0.24 + random() * 0.2),
		cy: height * (0.22 + random() * 0.2),
		r: short * (0.2 + random() * 0.06),
	};

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<defs>
		<linearGradient id="base" x1="0" y1="0" x2="0.25" y2="1">
			<stop offset="0%" stop-color="${theme.base[0]}"/>
			<stop offset="100%" stop-color="${theme.base[1]}"/>
		</linearGradient>
		<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="${theme.soft}" stop-opacity="0"/>
			<stop offset="50%" stop-color="${theme.soft}" stop-opacity="0.13"/>
			<stop offset="100%" stop-color="${theme.soft}" stop-opacity="0"/>
		</linearGradient>
		<linearGradient id="hallow" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.85"/>
			<stop offset="55%" stop-color="${theme.soft}" stop-opacity="0.5"/>
			<stop offset="100%" stop-color="${theme.accent}" stop-opacity="0.1"/>
		</linearGradient>
		<pattern id="stripes" width="86" height="86" patternUnits="userSpaceOnUse" patternTransform="rotate(112)">
			<line x1="0" y1="0" x2="0" y2="86" stroke="${theme.soft}" stroke-opacity="0.06" stroke-width="2"/>
		</pattern>
		<radialGradient id="vignette" cx="50%" cy="45%" r="72%">
			<stop offset="55%" stop-color="#000" stop-opacity="0"/>
			<stop offset="100%" stop-color="#000" stop-opacity="0.7"/>
		</radialGradient>
		${blobSvg}
	</defs>

	<rect width="${width}" height="${height}" fill="url(#base)"/>
	${blobRects}
	<rect width="${width}" height="${height}" fill="url(#stripes)"/>
	<rect x="0" y="${(height * 0.5).toFixed(0)}" width="${width}" height="${(height * 0.18).toFixed(0)}" fill="url(#beam)"/>
	${motifSvg}
	<circle cx="${halo.cx.toFixed(0)}" cy="${halo.cy.toFixed(0)}" r="${halo.r.toFixed(0)}"
		fill="none" stroke="url(#hallow)" stroke-width="${(short * 0.011).toFixed(1)}" stroke-linecap="round"
		stroke-dasharray="${(short * 0.9).toFixed(0)} ${(short * 0.5).toFixed(0)}" opacity="0.72"/>
	${sparkles}
	<rect width="${width}" height="${height}" fill="url(#vignette)"/>
</svg>`;
}

async function cleanup() {
	for (const dir of [OUT_DESKTOP, OUT_MOBILE]) {
		await mkdir(dir, { recursive: true });
		for (const entry of await readdir(dir)) {
			if (/^orig-(desktop|mobile)-\d+(-\d+)?\.avif$/.test(entry)) {
				await rm(path.join(dir, entry), { force: true });
			}
		}
	}
}

await cleanup();

let index = 0;
for (const theme of THEMES) {
	index += 1;
	const stamp = String(index).padStart(2, "0");
	const seed = theme.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 7);

	// 桌面 2K + 1600 小图（同一张图缩放，构图一致）
	const desktopSvg = buildSvg(theme, DESKTOP.width, DESKTOP.height, seed);
	const desktopBuffer = await sharp(Buffer.from(desktopSvg)).avif({ quality: QUALITY, effort: 4 }).toBuffer();
	const desktopFile = path.join(OUT_DESKTOP, `orig-desktop-${stamp}.avif`);
	await sharp(desktopBuffer).toFile(desktopFile);

	const smallBuffer = await sharp(Buffer.from(desktopSvg))
		.resize({ width: SMALL.width })
		.avif({ quality: QUALITY, effort: 4 })
		.toBuffer();
	await sharp(smallBuffer).toFile(path.join(OUT_DESKTOP, `orig-desktop-${stamp}-1600.avif`));

	// 手机竖版
	const mobileSvg = buildSvg(theme, MOBILE.width, MOBILE.height, seed + 31);
	await sharp(Buffer.from(mobileSvg))
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(path.join(OUT_MOBILE, `orig-mobile-${stamp}.avif`));

	console.log(
		`${theme.id.padEnd(12)} ${theme.motif.padEnd(7)} 桌面 ${(desktopBuffer.length / 1024).toFixed(0)}KB / 小图 ${(smallBuffer.length / 1024).toFixed(0)}KB`,
	);
}

console.log(`\n共生成 ${THEMES.length} 张原创壁纸（桌面 + 小图 + 手机）`);
