/**
 * 壁纸轮换
 *
 * - 每次刷新随机挑一张（页面内切路由不会乱跳）
 * - 停留 1 分 30 秒自动淡入换下一张
 * - 按时间段挑：白天偏明亮的图，晚上偏暗的图
 * - 换图时同步换主题配色
 * - 拿不到清单（禁用 JS）时保留构建时烘焙好的那一张
 */

interface WallpaperEntry {
	src: string;
	srcSet: string;
	vars: string;
	brightness: number;
}

interface WallpaperManifest {
	desktop: WallpaperEntry[];
	mobile: WallpaperEntry[];
}

/** 停留多久换下一张：1 分 30 秒 */
const DEFAULT_INTERVAL = 90000;

/** 本次页面加载选中的序号；模块只在整页加载时执行一次，路由切换不会重来 */
let order: number[] = [];
let cursor = 0;
let currentSrc = "";
let resizeTimer = 0;
let rotateTimer = 0;
let preloadTimer = 0;

/** 省流量模式 / 2G 网络就别提前拉下一张图了 */
function shouldPreload() {
	const connection = (navigator as unknown as {
		connection?: { saveData?: boolean; effectiveType?: string };
	}).connection;

	if (!connection) return true;
	if (connection.saveData) return false;
	return !(connection.effectiveType ?? "").includes("2g");
}

/** 空闲时把下一张壁纸拉进缓存，换图时就不会出现「等图片加载」的空档 */
function preloadWallpaper(entry: WallpaperEntry | undefined) {
	if (!entry || !shouldPreload()) return;
	const image = new Image();
	image.decoding = "async";
	image.sizes = "100vw";
	image.srcset = entry.srcSet ?? "";
	image.src = entry.src;
}

function schedulePreload(manifest: WallpaperManifest) {
	window.clearTimeout(preloadTimer);
	if (order.length < 2) return;

	const nextIndex = order[(cursor + 1) % order.length];
	const isMobile = window.matchMedia("(max-width: 768px)").matches;
	const entry = isMobile
		? manifest.mobile[nextIndex % Math.max(manifest.mobile.length, 1)]
		: manifest.desktop[nextIndex];

	// 在换图前 8 秒左右提前拉，太早拉会白占带宽
	preloadTimer = window.setTimeout(
		() => preloadWallpaper(entry),
		Math.max(2000, rotateInterval() - 8000),
	);
}

/** 调试用：地址后面加 ?wallpaperInterval=3000 可以加快轮换，方便验收 */
function rotateInterval() {
	const raw = Number(new URLSearchParams(window.location.search).get("wallpaperInterval"));
	return Number.isFinite(raw) && raw >= 1500 ? raw : DEFAULT_INTERVAL;
}

function readManifest(): WallpaperManifest | null {
	const node = document.getElementById("wallpaper-manifest");
	if (!node?.textContent) return null;
	try {
		return JSON.parse(node.textContent) as WallpaperManifest;
	} catch {
		return null;
	}
}

/**
 * 按当前时间段排出轮换顺序：
 * 白天（6:00-18:00）优先明亮的图，晚上优先暗一些的图；
 * 只取最贴近目标亮度的一部分参与轮换，其余的留作备用。
 */
function buildOrder(manifest: WallpaperManifest) {
	if (order.length) return;

	const hour = new Date().getHours();
	const target = hour >= 6 && hour < 18 ? 0.78 : 0.3;

	const ranked = manifest.desktop
		.map((entry, index) => ({ index, distance: Math.abs((entry.brightness ?? 0.5) - target) }))
		.sort((a, b) => a.distance - b.distance);

	const take = Math.max(3, Math.round(ranked.length * 0.6));
	order = ranked.slice(0, take).map((item) => item.index);

	// 打乱，避免每次都是同一个顺序
	for (let i = order.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
}

function applyTheme(vars: string) {
	const styleNode = document.getElementById("wallpaper-theme");
	if (!styleNode || !vars) return;
	// 与 BaseLayout 里烘焙的写法保持一致（:root:root 才能压过 tokens.css）
	const next = `:root:root{${vars}}`;
	if (styleNode.textContent === next) return;
	styleNode.textContent = next;
}

/** 把某张壁纸应用到英雄区；fade = true 时用一层淡入图做交叉过渡 */
function show(manifest: WallpaperManifest, index: number, fade: boolean) {
	const img = document.querySelector<HTMLImageElement>(".hero__media img");
	const source = document.querySelector<HTMLSourceElement>(".hero__media source");

	const desktopEntry = manifest.desktop[index] ?? manifest.desktop[0];
	const mobileEntry = manifest.mobile[index % Math.max(manifest.mobile.length, 1)] ?? manifest.mobile[0];
	if (!desktopEntry) return;

	const isMobile = window.matchMedia("(max-width: 768px)").matches;
	const active = isMobile && mobileEntry ? mobileEntry : desktopEntry;

	// <source> 在窄屏会盖过 <img>，两边都要更新
	if (source && mobileEntry && source.dataset.wallpaper !== mobileEntry.src) {
		source.dataset.wallpaper = mobileEntry.src;
		source.srcset = mobileEntry.src;
	}

	if (!img) return;

	const commit = () => {
		img.dataset.wallpaper = active.src;
		img.sizes = "100vw";
		img.srcset = active.srcSet ?? "";
		img.src = active.src;
		currentSrc = active.src;
	};

	if (!fade || !currentSrc) {
		commit();
		applyTheme(active.vars);
		return;
	}

	// 交叉淡入：新建一层盖上去，等它完全显示后再换底图
	const layer = document.createElement("img");
	layer.className = "hero__media-layer";
	layer.alt = "";
	layer.decoding = "async";
	layer.sizes = "100vw";
	layer.srcset = active.srcSet ?? "";
	layer.src = active.src;

	const finish = () => {
		commit();
		applyTheme(active.vars);
		window.setTimeout(() => layer.remove(), 1300);
	};

	layer.addEventListener("load", () => {
		window.requestAnimationFrame(() => {
			layer.style.opacity = "1";
			window.setTimeout(finish, 1150);
		});
	});
	layer.addEventListener("error", () => layer.remove());

	img.parentElement?.appendChild(layer);
}

function scheduleRotation(manifest: WallpaperManifest) {
	window.clearInterval(rotateTimer);
	if (order.length < 2) return;

	rotateTimer = window.setInterval(() => {
		if (document.hidden) return;
		cursor = (cursor + 1) % order.length;
		show(manifest, order[cursor], true);
		schedulePreload(manifest);
	}, rotateInterval());
}

export function initWallpaper() {
	const manifest = readManifest();
	if (!manifest || manifest.desktop.length === 0) return;

	buildOrder(manifest);

	/*
	 * 首次进入的起点：
	 * <head> 里的内联脚本已经随机挑好一张、并提前开始下载了（见 BaseLayout.astro），
	 * 这里直接沿用它当起点，避免「先下一张、JS 再换成另一张」的重复下载和跳变。
	 * 万一拿不到（脚本没跑），就退回老办法：按页面上那张图反查，查不到再随机。
	 */
	if (!currentSrc) {
		const chosen = (window as unknown as { __yukiWallpaper?: { index?: number } }).__yukiWallpaper;
		const img = document.querySelector<HTMLImageElement>("[data-wallpaper-image], .hero__media img");
		const current = img?.dataset.wallpaper || img?.getAttribute("src") || "";
		const startIndex =
			typeof chosen?.index === "number"
				? chosen.index
				: manifest.desktop.findIndex((entry) => entry.src === current);

		if (startIndex >= 0) {
			// 把它排到队首，后面的顺序保持随机
			order = [startIndex, ...order.filter((item) => item !== startIndex)];
			cursor = 0;
		} else {
			cursor = Math.floor(Math.random() * order.length);
		}
	}

	show(manifest, order[cursor] ?? 0, false);
	scheduleRotation(manifest);
	schedulePreload(manifest);
}

/** 窗口在手机/桌面断点之间变化时，换成对应方向的壁纸与配色 */
export function watchWallpaperBreakpoint() {
	const manifest = readManifest();
	if (!manifest) return;

	window.addEventListener(
		"resize",
		() => {
			window.clearTimeout(resizeTimer);
			resizeTimer = window.setTimeout(() => show(manifest, order[cursor] ?? 0, false), 220);
		},
		{ passive: true },
	);
}
