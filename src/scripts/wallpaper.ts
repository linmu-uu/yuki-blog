/**
 * 壁纸轮换
 *
 * - 每次刷新随机挑一张（页面内切路由不会乱跳）
 * - 停留 1 分 30 秒自动淡入换下一张
 * - 按时间段挑：白天偏明亮的图，晚上偏暗的图
 * - 换图时同步换主题配色
 * - 拿不到清单（禁用 JS）时保留构建时烘焙好的那一张
 */

interface MotionVideo {
	desktop: string;
	mobile: string;
	title?: string;
	bytes?: { desktop?: number; mobile?: number };
}

interface WallpaperEntry {
	src: string;
	srcSet: string;
	vars: string;
	brightness: number;
	/** 这一张同时有视频版（动态壁纸），没写就是纯静态 */
	video?: MotionVideo;
}

interface WallpaperManifest {
	desktop: WallpaperEntry[];
	mobile: WallpaperEntry[];
}

/** 停留多久换下一张：1 分 30 秒 */
const DEFAULT_INTERVAL = 90000;

/** 本次会话用的是第几张（跨页、跨硬刷新保持一致，不然配色会断层） */
const STORE_KEY = "yuki:wallpaper-index";

function readStoredIndex(): number | null {
	try {
		const raw = window.sessionStorage.getItem(STORE_KEY);
		if (raw === null) return null;
		const value = Number(raw);
		return Number.isInteger(value) ? value : null;
	} catch {
		return null;
	}
}

function writeStoredIndex(index: number) {
	try {
		window.sessionStorage.setItem(STORE_KEY, String(index));
	} catch {
		// 隐私模式下写不了，忽略
	}
}

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

	/*
	 * 主题配色在这里就应用，**不能等到确认有英雄区图片**：
	 * 站内切页时，新页面的 <style> 是构建时烘焙的旧配色，而当前壁纸是上一个页面延续的，
	 * 不在这一步补一刀，就会出现「首页一个色、切到别的页另一个色」的断层。
	 */
	applyTheme(active.vars);

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
		afterShow(manifest, active);
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
		afterShow(manifest, active);
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

/* ----------------------- 动态壁纸（视频） ----------------------- */

/**
 * 视频壁纸的设计原则：**永远先有静态图**。
 *
 * - 海报（静态 AVIF）走原来的管线，首屏、主题配色、缓存策略都不变
 * - 只有满足条件才额外下载视频，盖在图片上层淡入
 * - 手机默认不播（流量贵），系统开了「减弱动效」不播，省流量模式 / 2G-3G 不播
 * - 用户可以用英雄区那个按钮手动开关，选择存在 localStorage
 * - 切到后台标签页暂停解码，省电
 */

const MOTION_KEY = "yuki:motion";
let videoEl: HTMLVideoElement | null = null;
let currentManifest: WallpaperManifest | null = null;
/** 用来作废「已经排队但还没开始加载」的那次视频启动 */
let motionToken = "";

/** 浏览器空闲时再执行；没有 requestIdleCallback 就退化成延时 */
function whenIdle(task: () => void) {
	const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => void }).requestIdleCallback;
	if (typeof idle === "function") idle(task, { timeout: 2500 });
	else window.setTimeout(task, 800);
}

/** 用户的显式选择：true = 播，false = 不播，null = 没选过 */
function motionPreference(): boolean | null {
	const raw = new URLSearchParams(window.location.search).get("motion");
	if (raw === "on") return true;
	if (raw === "off") return false;

	try {
		const stored = window.localStorage.getItem(MOTION_KEY);
		if (stored === "on") return true;
		if (stored === "off") return false;
	} catch {
		// 隐私模式下 localStorage 可能不可用
	}
	return null;
}

/** 现在到底该不该播 */
function motionEnabled(): boolean {
	const pref = motionPreference();
	if (pref === false) return false;
	// 无障碍底线：系统要求减弱动效就别放
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
	// 复用「省流量 / 2g」的判断（preloadWallpaper 用的同一个）
	if (!shouldPreload()) return false;
	if (pref === true) return true;
	// 没选过：桌面端默认开，手机端等用户自己点
	return window.matchMedia("(min-width: 769px)").matches;
}

function videoUrlFor(entry: WallpaperEntry): string {
	const isMobile = window.matchMedia("(max-width: 768px)").matches;
	return (isMobile ? entry.video?.mobile : entry.video?.desktop) ?? "";
}

function removeMotion() {
	if (!videoEl) return;
	videoEl.pause();
	// 只把元素摘掉：removeAttribute("src") + load() 会把下载中的请求打断成 ERR_ABORTED，
	// 紧接着重建同一段视频时可能直接 error，表现为「关了再开回不来」
	videoEl.remove();
	videoEl = null;
	motionToken = "";
}

/** 换壁纸、点开关、跨断点都会走这里 */
function applyMotion(entry: WallpaperEntry | undefined) {
	const button = document.querySelector<HTMLButtonElement>("[data-motion-toggle]");
	if (button) button.hidden = !entry?.video;
	if (!entry?.video) {
		removeMotion();
		return;
	}

	const enabled = motionEnabled();
	if (button) {
		button.setAttribute("aria-pressed", String(enabled));
		const label = button.querySelector<HTMLElement>("[data-motion-label]");
		// 文案写「点了会怎样」，别写当前状态 —— 状态可以靠图标和 aria-pressed 表达
		if (label) label.textContent = enabled ? "暂停动效" : "播放动效";
		button.title = enabled
			? "这张壁纸是动态的，正在播放。点一下切成静态图（省流量、省电）"
			: "点一下播放动态壁纸（会下载一段短视频，约 1–3MB）";
	}

	/*
	 * 关掉开关时只暂停收起，不销毁：同一段视频再打开直接复用，
	 * 省掉一次几百 KB 到几 MB 的重复下载。
	 */
	if (!enabled) {
		if (videoEl) {
			videoEl.pause();
			videoEl.classList.remove("is-playing");
		}
		return;
	}

	const url = videoUrlFor(entry);
	if (videoEl && videoEl.dataset.url === url) {
		void videoEl.play().catch(() => {});
		return;
	}

	removeMotion();
	const media = document.querySelector<HTMLElement>(".hero__media");
	if (!media || !url) return;

	/*
	 * 别跟首屏海报抢带宽：等 window load 之后再在空闲时开始下视频。
	 * 手机预设下这一步能让 FCP/LCP 从 2.9s/3.6s 回到 1s 出头。
	 */
	const token = `${url}#${Math.random().toString(36).slice(2)}`;
	motionToken = token;

	const start = () => {
		// 排队期间可能已经换图或者被用户关掉了
		if (motionToken !== token) return;

		const video = document.createElement("video");
		video.className = "hero__media-video";
		video.muted = true;
		video.loop = true;
		video.autoplay = true;
		video.playsInline = true;
		video.preload = "auto";
		video.poster = entry.src;
		video.setAttribute("aria-hidden", "true");
		video.tabIndex = -1;
		video.src = url;
		video.dataset.url = url;
		video.addEventListener("playing", () => video.classList.add("is-playing"), { once: true });
		video.addEventListener("error", () => video.remove(), { once: true });

		media.appendChild(video);
		videoEl = video;
		// 被浏览器的自动播放策略拦掉也没关系：静态海报还在下面
		void video.play().catch(() => {});
	};

	if (document.readyState === "complete") whenIdle(start);
	else window.addEventListener("load", () => whenIdle(start), { once: true });
}

function currentEntryOf(manifest: WallpaperManifest | null): WallpaperEntry | undefined {
	if (!manifest) return undefined;
	return (
		manifest.desktop.find((item) => item.src === currentSrc) ??
		manifest.mobile.find((item) => item.src === currentSrc)
	);
}

/** show() 每次落地后同步状态：记下清单、按当前那张决定要不要放视频 */
function afterShow(manifest: WallpaperManifest, entry: WallpaperEntry | undefined) {
	currentManifest = manifest;
	applyMotion(entry);
}

function bindMotionToggle() {
	const button = document.querySelector<HTMLButtonElement>("[data-motion-toggle]");
	if (!button || button.dataset.bound === "1") return;
	button.dataset.bound = "1";

	button.addEventListener("click", () => {
		const next = button.getAttribute("aria-pressed") === "true" ? "off" : "on";
		// URL 上的 ?motion= 是调试开关，优先级最高；用户一旦自己点了，就把它摘掉
		try {
			const url = new URL(window.location.href);
			if (url.searchParams.has("motion")) {
				url.searchParams.delete("motion");
				window.history.replaceState(null, "", url);
			}
		} catch {
			// 某些沙箱里 replaceState 会抛，忽略即可
		}
		try {
			window.localStorage.setItem(MOTION_KEY, next);
		} catch {
			// 存不了就只在本次会话生效
		}
		applyMotion(currentEntryOf(currentManifest));
	});

	// 切到后台暂停解码，回来再继续
	document.addEventListener("visibilitychange", () => {
		if (!videoEl) return;
		if (document.hidden) videoEl.pause();
		else void videoEl.play().catch(() => {});
	});
}

function scheduleRotation(manifest: WallpaperManifest) {
	window.clearInterval(rotateTimer);
	if (order.length < 2) return;

	rotateTimer = window.setInterval(() => {
		if (document.hidden) return;
		cursor = (cursor + 1) % order.length;
		writeStoredIndex(order[cursor]);
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
		// 优先级：head 挑好的 → 本次会话记录的那张 → 按页面上已有的图反查
		const stored = readStoredIndex();
		const startIndex =
			typeof chosen?.index === "number"
				? chosen.index
				: (stored ?? manifest.desktop.findIndex((entry) => entry.src === current));

		if (startIndex >= 0) {
			// 把它排到队首，后面的顺序保持随机
			order = [startIndex, ...order.filter((item) => item !== startIndex)];
			cursor = 0;
		} else {
			cursor = Math.floor(Math.random() * order.length);
		}
	}

	writeStoredIndex(order[cursor] ?? 0);
	show(manifest, order[cursor] ?? 0, false);
	bindMotionToggle();
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
