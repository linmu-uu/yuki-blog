/**
 * 从壁纸里提取主色调，供"智能主题"使用。
 *
 * 做三件事：
 * 1. 统计整图平均亮度 —— 决定英雄区要不要多压暗一点、文字用亮还是暗
 * 2. 找出最鲜艳的两个色相 —— 作为站点强调色（accent / accent-2）
 * 3. 输出 src/data/wallpaper-palettes.json
 *
 * 用法：npm run wallpapers:palette
 */

import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIRS = [
	{ dir: path.resolve("public/wallpaper/desktop"), prefix: "/wallpaper/desktop/" },
	{ dir: path.resolve("public/wallpaper/mobile"), prefix: "/wallpaper/mobile/" },
];
const OUT = path.resolve("src/data/wallpaper-palettes.json");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** #rrggbb → [r, g, b] */
const hexToRgb = (hex) => {
	const value = hex.replace("#", "");
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	];
};

function rgbToHsl(r, g, b) {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return { h: 0, s: 0, l };
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
	else if (max === gn) h = ((bn - rn) / d + 2) / 6;
	else h = ((rn - gn) / d + 4) / 6;
	return { h, s, l };
}

function hslToHex(h, s, l) {
	const hue2rgb = (p, q, t) => {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return p + (q - p) * 6 * tt;
		if (tt < 1 / 2) return q;
		if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
		return p;
	};
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const toHex = (v) =>
		Math.round(clamp(v, 0, 1) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
}

/**
 * 蔚蓝档案主色调约束
 *
 * 壁纸的色相跨度可能很大（暖橙、粉红、青绿都有），全部硬夹成蓝会让每张图看起来都一样。
 * 所以按角色分层放权，但整体收在蔚蓝档案的调性里：
 *   - 主色：±27°（守紧一点，换图也是 BA 蓝）
 *   - 辅色：±43°，青 / 紫还能看出差别
 *   - 点缀色（accent-3 / 光环）：±65°，暖色点缀不至于完全没有
 * 想更保守 / 更放开，就改下面这三个数（单位是色相环上的比例，1 = 360°）。
 */
const HUE_TARGET = 0.585;

const HUE_LIMITS = {
	primary: 0.075, // ≈27°
	secondary: 0.12, // ≈43°
	tertiary: 0.18, // ≈65°
};

function constrainHue(h, limit) {
	let diff = h - HUE_TARGET;
	if (diff > 0.5) diff -= 1;
	if (diff < -0.5) diff += 1;

	const clamped = Math.max(-limit, Math.min(limit, diff));
	return (HUE_TARGET + clamped + 1) % 1;
}

async function analyse(file) {
	const { data, info } = await sharp(file)
		.resize(72, 72, { fit: "inside" })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const buckets = Array.from({ length: 12 }, () => ({
		count: 0,
		sat: 0,
		lum: 0,
		r: 0,
		g: 0,
		b: 0,
	}));

	let lumSum = 0;
	let pixels = 0;

	for (let i = 0; i < data.length; i += info.channels) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const { h, s, l } = rgbToHsl(r, g, b);
		lumSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		pixels += 1;

		// 只统计"有颜色且不太黑/不太白"的像素，避免把大片背景色当成主题色
		if (s < 0.16 || l < 0.14 || l > 0.9) continue;

		const bucket = buckets[Math.floor(h * 12) % 12];
		bucket.count += 1;
		bucket.sat += s;
		bucket.lum += l;
		bucket.r += r;
		bucket.g += g;
		bucket.b += b;
	}

	const avg = (v, count) => v / Math.max(count, 1);

	const ranked = buckets
		.map((bucket) => ({
			count: bucket.count,
			score: bucket.count * avg(bucket.sat, bucket.count) ** 1.4,
			color: [avg(bucket.r, bucket.count), avg(bucket.g, bucket.count), avg(bucket.b, bucket.count)],
			lum: avg(bucket.lum, bucket.count),
		}))
		.filter((item) => item.count > 8)
		.sort((a, b) => b.score - a.score);

	const normalise = (color, targetSat, targetLum, hueLimit) => {
		const { h, s, l } = rgbToHsl(...color);
		return hslToHex(
			constrainHue(h, hueLimit),
			clamp(s * 1.35, 0.5, targetSat),
			clamp(l, 0.5, targetLum),
		);
	};

	const primary = ranked[0];
	const hueDistance = (a, b) => {
		const diff = Math.abs(rgbToHsl(...a.color).h - rgbToHsl(...b.color).h);
		return Math.min(diff, 1 - diff);
	};
	const pickDistinct = (exclude, minDistance) =>
		ranked.find((item) => exclude.every((other) => !other || hueDistance(item, other) > minDistance));

	const secondary = pickDistinct([primary], 0.06);
	const tertiary = pickDistinct([primary, secondary], 0.06);

	// 点缀色兜底：没有第三个色相就用辅色调亮当高光
	const lighten = (hex, amount) => {
		const value = hex.replace("#", "");
		const mix = (channel) => Math.round(channel + (255 - channel) * amount);
		const r = mix(Number.parseInt(value.slice(0, 2), 16));
		const g = mix(Number.parseInt(value.slice(2, 4), 16));
		const b = mix(Number.parseInt(value.slice(4, 6), 16));
		return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
	};

	/*
	 * 单色系壁纸（比如程序生成的渐变图）常常找不出第二个色相。
	 * 这时从主色派生一个同族邻居，而不是硬塞一个固定青色 —— 紫色壁纸配青色辅色会很跳。
	 */
	const derive = (hex, hueShift, satTarget, lumTarget) => {
		const { h, s, l } = rgbToHsl(...hexToRgb(hex));
		return hslToHex(
			(h + hueShift + 1) % 1,
			clamp(s * 0.92, 0.4, satTarget),
			clamp(l, 0.4, lumTarget),
		);
	};

	const accent = primary ? normalise(primary.color, 0.94, 0.66, HUE_LIMITS.primary) : "#3b9bff";
	const accent2 = secondary
		? normalise(secondary.color, 0.9, 0.74, HUE_LIMITS.secondary)
		: derive(accent, 0.05, 0.85, 0.8);
	const accent3 = tertiary
		? normalise(tertiary.color, 0.92, 0.8, HUE_LIMITS.tertiary)
		: lighten(derive(accent, -0.05, 0.8, 0.88), 0.12);

	const brightness = lumSum / Math.max(pixels, 1);

	return {
		accent,
		accent2,
		accent3,
		brightness: Number(brightness.toFixed(3)),
		dark: brightness < 0.42,
		sampled: ranked.length,
	};
}

const result = {};
let count = 0;

for (const { dir, prefix } of DIRS) {
	let entries = [];
	try {
		entries = await readdir(dir);
	} catch {
		continue;
	}
	for (const entry of entries.sort()) {
		// 只分析实际参与轮换的壁纸（ba-* 自己找的图、ai-* AI 原创图）
		if (!/^(?:ba|ai)-(?:desktop|mobile)-\d+\.avif$/.test(entry)) continue;
		const info = await analyse(path.join(dir, entry));
		result[`${prefix}${entry}`] = info;
		count += 1;
		console.log(
			`${entry.padEnd(22)} 主色 ${info.accent}  辅色 ${info.accent2}  点缀 ${info.accent3}  亮度 ${info.brightness}${info.dark ? "（偏暗）" : ""}`,
		);
	}
}

await writeFile(OUT, `${JSON.stringify(result, null, "\t")}\n`, "utf8");
console.log(`\n分析完成：${count} 张，已写入 ${path.relative(process.cwd(), OUT)}`);
