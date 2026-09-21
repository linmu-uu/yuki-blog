import palettes from "./wallpaper-palettes.json";

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

export const background = {
	mode: "image" as "gradient" | "image",

	// "gradient" 模式下留空则每次构建随机挑一个预设；也可以写死，比如 "schale"
	gradient: "",

	image: {
		// 你自己找的蔚蓝档案壁纸（scripts/import-wallpapers.mjs 导入并压缩过）
		// 每次刷新页面会随机挑一张显示，配色也跟着这张图走
		desktop: [
			"/wallpaper/desktop/ba-desktop-01.avif",
			"/wallpaper/desktop/ba-desktop-02.avif",
			"/wallpaper/desktop/ba-desktop-03.avif",
			"/wallpaper/desktop/ba-desktop-04.avif",
			"/wallpaper/desktop/ba-desktop-05.avif",
			"/wallpaper/desktop/ba-desktop-06.avif",
			"/wallpaper/desktop/ba-desktop-07.avif",
			"/wallpaper/desktop/ba-desktop-08.avif",
			"/wallpaper/desktop/ba-desktop-09.avif",
		],
		mobile: [
			"/wallpaper/mobile/ba-mobile-01.avif",
			"/wallpaper/mobile/ba-mobile-02.avif",
			"/wallpaper/mobile/ba-mobile-03.avif",
			"/wallpaper/mobile/ba-mobile-04.avif",
			"/wallpaper/mobile/ba-mobile-05.avif",
			"/wallpaper/mobile/ba-mobile-06.avif",
			"/wallpaper/mobile/ba-mobile-07.avif",
			"/wallpaper/mobile/ba-mobile-08.avif",
			"/wallpaper/mobile/ba-mobile-09.avif",
		],

		/* 备选：程序生成的原创渐变壁纸（零版权风险），想混着用就把下面解开
		desktop: [
			"/wallpaper/desktop/ba-desktop-01.avif",
			"/wallpaper/desktop/ba-desktop-02.avif",
			"/wallpaper/desktop/schale.avif",
			"/wallpaper/desktop/millennium.avif",
			"/wallpaper/desktop/halo.avif",
			"/wallpaper/desktop/trinity.avif",
		],
		mobile: [
			"/wallpaper/mobile/ba-mobile-01.avif",
			"/wallpaper/mobile/ba-mobile-02.avif",
			"/wallpaper/mobile/ba-mobile-03.avif",
			"/wallpaper/mobile/ba-mobile-04.avif",
			"/wallpaper/mobile/schale.avif",
			"/wallpaper/mobile/millennium.avif",
			"/wallpaper/mobile/halo.avif",
			"/wallpaper/mobile/trinity.avif",
		],
		*/
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

/** 依据壁纸调色板生成一段 CSS 变量覆盖 */
export function paletteToCssVars(palette: WallpaperPalette): string {
	const rgb = hexToRgbParts(palette.accent);
	const rgb2 = hexToRgbParts(palette.accent2);
	const soft = lightenHex(palette.accent, 0.42);
	const deep = lightenHex(palette.accent, 0.12);
	// 壁纸越亮，英雄区压暗得越多，保证标题可读
	const veil = Math.min(0.86, 0.46 + palette.brightness * 0.55).toFixed(2);

	return [
		`--accent:${palette.accent}`,
		`--accent-rgb:${rgb}`,
		`--accent-soft:${soft}`,
		`--accent-2:${palette.accent2}`,
		`--gradient-accent:linear-gradient(120deg, ${palette.accent}, ${palette.accent2} 60%, ${soft})`,
		`--gradient-a:linear-gradient(120deg, ${palette.accent}, ${palette.accent2})`,
		`--gradient-b:linear-gradient(120deg, ${palette.accent2}, ${soft})`,
		`--gradient-soft:linear-gradient(120deg, rgba(${rgb}, 0.22), rgba(${rgb2}, 0.14))`,
		`--gradient-spectrum:linear-gradient(120deg, ${deep}, ${palette.accent} 30%, ${palette.accent2} 62%, ${soft} 100%)`,
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
export function wallpaperSrcSet(src: string): string {
	// 只有桌面图做了 1600px 的轻量版，手机版是竖图，不加候选免得指到不存在的文件
	if (!src.endsWith(".avif") || !src.includes("/desktop/")) return "";
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
