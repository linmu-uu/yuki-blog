import palettes from "./wallpaper-palettes.json";
import sizes from "./wallpaper-sizes.json";
import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * 背景配置
 *
 * mode:
 *   "gradient" —— 纯 CSS 渐变背景，零版权风险、加载快（默认）
 *   "image"    —— 使用 public/wallpaper/ 里的图片
 *
 * 想用自己的图：把图片放进 public/wallpaper/desktop/ 和 public/wallpaper/mobile/，
 * 然后把下面的 mode 改成 "image"，并把文件名填进 desktop / mobile 数组（可放多张，每次访问随机一张）。
 */

export interface GradientPreset {
	id: string;
	name: string;
	/** 底色 → 主光 → 辅光 */
	colors: [string, string, string];
}

export interface WallpaperPalette {
	accent: string;
	accent2: string;
	/** 点缀色：允许更宽的色相范围，暖色壁纸也能留下自己的味道 */
	accent3?: string;
	brightness: number;
	dark: boolean;
}

export interface PickedWallpaper {
	src: string;
	srcMobile: string;
	palette: WallpaperPalette | null;
	paletteMobile: WallpaperPalette | null;
}

export const gradientPresets: GradientPreset[] = [
	{ id: "schale", name: "夏莱蓝", colors: ["#081428", "#128afa", "#5fe1ff"] },
	{ id: "millennium", name: "千年科技", colors: ["#060f24", "#2f6bff", "#8ce6ff"] },
	{ id: "halo", name: "光环金", colors: ["#0a1730", "#1e5fd0", "#ffe08a"] },
	{ id: "trinity", name: "三一学院", colors: ["#0b1226", "#3b9bff", "#cdeaff"] },
];

/**
 * 扫描 public/wallpaper/<kind>/ 下参与轮换的壁纸。
 *
 * 收两类：
 *   - `ba-<kind>-NN.avif`：npm run wallpapers:import 导入的、自己找的图
 *   - `ai-<kind>-NN.avif`：npm run wallpapers:ai 处理好的 AI 原创二次元壁纸
 * 程序生成的纯渐变壁纸（orig-* 以及早期的 schale / millennium / halo / trinity）
 * 没有二次元人物，已经移出轮换；哪天想让它们回来，把前缀加进下面这个数组就行。
 */
const ALLOWED_PREFIXES = ["ba-", "ai-"];

function listWallpapers(kind: "desktop" | "mobile"): string[] {
	try {
		return readdirSync(path.resolve("public/wallpaper", kind))
			.filter((name) => {
				if (!name.endsWith(".avif")) return false;
				if (/-\d+-\d+\.avif$/.test(name)) return false; // 1600/2560 小图交给 srcset，不进轮换
				return ALLOWED_PREFIXES.some((prefix) => name.startsWith(`${prefix}${kind}-`));
			})
			.sort()
			.map((name) => `/wallpaper/${kind}/${name}`);
	} catch {
		return [];
	}
}

export const background = {
	mode: "image" as "gradient" | "image",

	// "gradient" 模式下留空则每次构建随机挑一个预设；也可以写死，比如 "schale"
	gradient: "",

	image: {
		/*
		 * 壁纸清单由目录自动扫描生成（构建时在 Node 里读文件夹）：
		 * 只收 ba-*（自己找的图，用 npm run wallpapers:import 导入并压缩）。
		 * 加图之后不用再来改这里。
		 */
		desktop: listWallpapers("desktop"),
		mobile: listWallpapers("mobile"),
	},
};

export function pickGradient(): GradientPreset {
	if (background.gradient) {
		const found = gradientPresets.find((preset) => preset.id === background.gradient);
		if (found) return found;
	}
	return gradientPresets[Math.floor(Math.random() * gradientPresets.length)];
}

export function pickImage(kind: "desktop" | "mobile"): string {
	const list = background.image[kind];
	return list[Math.floor(Math.random() * list.length)] ?? list[0];
}

const paletteTable = palettes as Record<string, WallpaperPalette | undefined>;

let picked: PickedWallpaper | null = null;

/**
 * 随机挑一张壁纸，并带上它对应的调色板。
 * 同一个构建进程里只挑一次，保证整站配色一致、每页不会各挑一张。
 */
export function pickWallpaper(): PickedWallpaper {
	if (picked) return picked;

	const src = pickImage("desktop");
	const srcMobile = pickImage("mobile");

	picked = {
		src,
		srcMobile,
		palette: paletteTable[src] ?? null,
		paletteMobile: paletteTable[srcMobile] ?? null,
	};

	if (process.env.NODE_ENV !== "production" || process.env.DEBUG_WALLPAPER) {
		console.log(
			`[wallpaper] 本次使用：${src}${picked.palette ? `  主色 ${picked.palette.accent}` : ""}`,
		);
	}

	return picked;
}

/** #rrggbb → "r, g, b"，用于 rgba(var(--accent-rgb), .3) 这种写法 */
export function hexToRgbParts(hex: string): string {
	const value = hex.replace("#", "");
	const full =
		value.length === 3
			? value
					.split("")
					.map((c) => c + c)
					.join("")
			: value;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	return `${r}, ${g}, ${b}`;
}

/** 把颜色往白里提亮，用于渐变副色 */
export function lightenHex(hex: string, amount = 0.3): string {
	const value = hex.replace("#", "");
	const full =
		value.length === 3
			? value
					.split("")
					.map((c) => c + c)
					.join("")
			: value;
	const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
	const r = mix(Number.parseInt(full.slice(0, 2), 16));
	const g = mix(Number.parseInt(full.slice(2, 4), 16));
	const b = mix(Number.parseInt(full.slice(4, 6), 16));
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** 把颜色往黑里压暗，用于深色渐变与底色 */
export function darkenHex(hex: string, amount = 0.3): string {
	const value = hex.replace("#", "");
	const full =
		value.length === 3
			? value
					.split("")
					.map((c) => c + c)
					.join("")
			: value;
	const mix = (channel: number) => Math.round(channel * (1 - amount));
	const r = mix(Number.parseInt(full.slice(0, 2), 16));
	const g = mix(Number.parseInt(full.slice(2, 4), 16));
	const b = mix(Number.parseInt(full.slice(4, 6), 16));
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** 依据壁纸调色板生成一段 CSS 变量覆盖 */
export function paletteToCssVars(palette: WallpaperPalette): string {
	const accent = palette.accent;
	const accent2 = palette.accent2;
	// 老数据没有 accent3 时，用辅色调亮当高光
	const accent3 = palette.accent3 || lightenHex(accent2, 0.35);
	const halo = lightenHex(accent3, 0.25);

	const rgb = hexToRgbParts(accent);
	const rgb2 = hexToRgbParts(accent2);
	const haloRgb = hexToRgbParts(halo);

	const soft = lightenHex(accent, 0.5);
	const deep = darkenHex(accent, 0.55);
	// 壁纸越亮，英雄区压暗得越多，保证标题可读
	const veil = Math.min(0.86, 0.46 + palette.brightness * 0.55).toFixed(2);

	return [
		`--accent:${accent}`,
		`--accent-rgb:${rgb}`,
		`--accent-soft:${soft}`,
		`--accent-2:${accent2}`,
		`--accent-3:${accent3}`,
		`--accent-deep:${deep}`,
		`--halo:${halo}`,
		`--halo-rgb:${haloRgb}`,
		// 描边也跟着壁纸走（透明度压得低，不影响可读性）
		`--border:rgba(${rgb}, 0.16)`,
		`--border-strong:rgba(${rgb}, 0.34)`,
		`--gradient-accent:linear-gradient(120deg, ${accent}, ${accent2} 58%, ${soft})`,
		`--gradient-a:linear-gradient(120deg, ${accent}, ${accent2})`,
		`--gradient-b:linear-gradient(120deg, ${accent2}, ${soft} 55%, ${halo})`,
		`--gradient-c:linear-gradient(120deg, ${accent3}, ${accent})`,
		`--gradient-soft:linear-gradient(120deg, rgba(${rgb}, 0.22), rgba(${rgb2}, 0.14))`,
		`--gradient-spectrum:linear-gradient(120deg, ${deep}, ${accent} 26%, ${accent2} 52%, ${soft} 76%, ${halo})`,
		`--glow-accent:0 0 0 1px rgba(${rgb}, 0.4), 0 18px 50px -22px rgba(${rgb}, 0.55)`,
		`--glow-cyan:0 0 0 1px rgba(${rgb2}, 0.34), 0 18px 50px -22px rgba(${rgb2}, 0.45)`,
		`--glow-halo:0 0 22px rgba(${haloRgb}, 0.55), 0 0 60px rgba(${haloRgb}, 0.28)`,
		`--hero-veil:${veil}`,
	].join(";");
}

export interface WallpaperEntry {
	src: string;
	/** 两档尺寸的候选列表，交给浏览器按屏幕挑 */
	srcSet: string;
	vars: string;
	/** 画面平均亮度，用于"白天用亮图、晚上用暗图" */
	brightness: number;
}

export interface WallpaperManifest {
	desktop: WallpaperEntry[];
	mobile: WallpaperEntry[];
}

/**
 * 桌面壁纸有两档尺寸：1600px 的轻量版（体积大约一半）和 2560px 的原图。
 * 写进 srcset 让浏览器按屏幕宽度自己挑，1080p / 1440p 的屏幕就不用下大图了。
 */
interface SizeEntry {
	width: number;
	candidates?: { src: string; w: number }[];
}

const sizeTable = sizes as Record<string, SizeEntry | undefined>;

export function wallpaperSrcSet(src: string): string {
	// 手机版是竖图，没有候选，免得指到不存在的文件
	if (!src.endsWith(".avif") || !src.includes("/desktop/")) return "";

	// 新壁纸（AI 那批）在生成时登记了真实候选：1600 / 2560 / 3840
	const entry = sizeTable[src];
	if (entry?.candidates?.length) {
		return entry.candidates.map((item) => `${item.src} ${item.w}w`).join(", ");
	}

	// 老壁纸没登记尺寸，沿用原来的两档写法
	return `${src.replace(/\.avif$/, "-1600.avif")} 1600w, ${src} 2560w`;
}

/**
 * 生成给浏览器用的壁纸清单：包含每张图的地址和它对应的主题变量。
 * 页面加载时由 JS 随机挑一张，这样每次刷新都能换壁纸，不用重新部署。
 */
export function buildWallpaperManifest(): WallpaperManifest {
	const toEntry = (src: string): WallpaperEntry => {
		const palette = paletteTable[src];
		return {
			src,
			srcSet: wallpaperSrcSet(src),
			vars: palette ? paletteToCssVars(palette) : "",
			brightness: palette?.brightness ?? 0.5,
		};
	};

	return {
		desktop: background.image.desktop.map(toEntry),
		mobile: background.image.mobile.map(toEntry),
	};
}
