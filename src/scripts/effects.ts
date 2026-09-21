/**
 * 站点动效与交互
 *
 * 注意：飘落花瓣已经改成纯 CSS 动画（见 PetalLayer.astro），
 * 不再依赖 requestAnimationFrame —— 之前那套 canvas 方案在某些环境会掉帧停住。
 *
 * 配合 Astro 的 ClientRouter 使用：
 * - 全局只初始化一次（鼠标柔光、滚动进度、视差、卡片光斑、回到顶部监听）
 * - 每次切页都要重做的（滚动出现、打字机、顶栏状态）放在 init() 里
 */

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let globalReady = false;
let firstLoad = true;

/* ---------------- 滚动出现（每次切页都要重新观察） ---------------- */

function initReveal() {
	const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
	if (!targets.length) return;

	if (prefersReduced) {
		for (const el of targets) el.classList.add("is-visible");
		return;
	}

	// 只有首次进入才做错开入场；从别的页面切回来时直接显示，
	// 否则会和页面切换动画叠在一起，看起来忽快忽慢、错位。
	if (!firstLoad) {
		for (const el of targets) {
			el.style.setProperty("--reveal-delay", "0ms");
			el.classList.add("is-visible");
		}
		return;
	}
	firstLoad = false;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.add("is-visible");
					observer.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
	);

	for (const el of targets) observer.observe(el);
}

/* ---------------- 标题打字机（只有首页有） ---------------- */

function initTypewriter() {
	const el = document.querySelector<HTMLElement>("[data-typed]");
	if (!el || el.dataset.typing === "on") return;

	const lines = (el.dataset.typed || "").split("|").filter(Boolean);
	if (!lines.length) return;

	if (prefersReduced) {
		el.textContent = lines[0];
		return;
	}

	el.dataset.typing = "on";
	let lineIndex = 0;
	let charIndex = 0;
	let deleting = false;

	const tick = () => {
		if (!el.isConnected) return;
		const line = lines[lineIndex];
		charIndex += deleting ? -1 : 1;
		el.textContent = line.slice(0, charIndex);

		let delay = deleting ? 45 : 95;

		if (!deleting && charIndex === line.length) {
			deleting = true;
			delay = 2200;
		} else if (deleting && charIndex === 0) {
			deleting = false;
			lineIndex = (lineIndex + 1) % lines.length;
			delay = 420;
		}

		window.setTimeout(tick, delay);
	};

	window.setTimeout(tick, 700);
}

/* ---------------- 顶栏滚动状态 ---------------- */

/* ---------------- 懒加载图片淡入 ---------------- */

function initImageFade() {
	const images = document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]');
	for (const image of images) {
		if (image.dataset.fadeBound === "1") continue;
		// 已经加载完的就别动它了，避免闪一下
		if (image.complete && image.naturalWidth > 0) continue;

		image.dataset.fadeBound = "1";
		image.classList.add("is-loading");

		const done = () => image.classList.remove("is-loading");
		image.addEventListener("load", done, { once: true });
		image.addEventListener("error", done, { once: true });
	}
}

function syncHeader() {
	const header = document.querySelector<HTMLElement>(".site-header");
	if (!header) return;
	header.classList.toggle("is-scrolled", window.scrollY > 24);
}

/* ---------------- 回到顶部按钮 ---------------- */

function syncToTop() {
	const button = document.querySelector<HTMLElement>("[data-to-top]");
	if (!button) return;
	button.classList.toggle("is-visible", window.scrollY > 600);
}

function initToTop() {
	const button = document.querySelector<HTMLButtonElement>("[data-to-top]");
	if (!button) return;

	if (button.dataset.bound !== "1") {
		button.dataset.bound = "1";
		button.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
		});
	}

	syncToTop();
}

/* ---------------- 鼠标柔光 ---------------- */

function initCursorGlow() {
	if (prefersReduced) return;

	const glow = document.querySelector<HTMLElement>(".cursor-glow");
	if (!glow || window.matchMedia("(pointer: coarse)").matches) return;

	// 指针事件比帧率密得多，攒到下一帧再写样式，避免每个事件都触发一次样式重算
	let raf = 0;
	let nextX = 0;
	let nextY = 0;

	window.addEventListener(
		"pointermove",
		(event) => {
			nextX = event.clientX - 260;
			nextY = event.clientY - 260;
			if (raf) return;
			raf = window.requestAnimationFrame(() => {
				raf = 0;
				glow.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
				glow.style.opacity = "1";
			});
		},
		{ passive: true },
	);
	window.addEventListener("pointerleave", () => {
		glow.style.opacity = "0";
	});
}

/* ---------------- 顶部滚动进度条 ---------------- */

function initScrollProgress() {
	const update = () => {
		const bar = document.querySelector<HTMLElement>(".scroll-progress");
		if (!bar) return;
		const max = document.documentElement.scrollHeight - window.innerHeight;
		const progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
		bar.style.setProperty("--progress", progress.toFixed(4));
	};

	let raf = 0;
	const onScroll = () => {
		if (!raf) {
			raf = window.requestAnimationFrame(() => {
				raf = 0;
				update();
			});
		}
	};

	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", onScroll, { passive: true });
	document.addEventListener("astro:page-load", update);
	update();
}

/* ---------------- 英雄区视差 ---------------- */

function initHeroParallax() {
	if (prefersReduced) return;

	let raf = 0;
	const update = () => {
		const media = document.querySelector<HTMLElement>(".hero__media");
		const halo = document.querySelector<HTMLElement>(".hero__halo");
		const streaks = document.querySelector<HTMLElement>(".hero__streaks");
		const y = window.scrollY;
		if (y > window.innerHeight * 1.4) return;

		if (media) media.style.transform = `translate3d(0, ${(y * 0.16).toFixed(1)}px, 0)`;
		if (halo) halo.style.transform = `translate3d(0, ${(y * -0.06).toFixed(1)}px, 0)`;
		if (streaks) streaks.style.transform = `translate3d(0, ${(y * 0.08).toFixed(1)}px, 0)`;
	};

	const onScroll = () => {
		if (!raf) {
			raf = window.requestAnimationFrame(() => {
				raf = 0;
				update();
			});
		}
	};

	window.addEventListener("scroll", onScroll, { passive: true });
}

/* ---------------- 卡片跟随鼠标的光斑（事件委托） ---------------- */

function initCardLight() {
	if (prefersReduced) return;
	if (window.matchMedia("(pointer: coarse)").matches) return;

	let raf = 0;
	let active: HTMLElement | null = null;
	let pointX = 0;
	let pointY = 0;

	const apply = () => {
		raf = 0;
		const card = active;
		if (!card || !card.isConnected) return;

		const rect = card.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;

		const x = pointX - rect.left;
		const y = pointY - rect.top;
		card.style.setProperty("--mx", `${x.toFixed(0)}px`);
		card.style.setProperty("--my", `${y.toFixed(0)}px`);

		// 轻微 3D 倾斜：鼠标在卡片里的位置换算成旋转角度
		const ratioX = x / rect.width - 0.5;
		const ratioY = y / rect.height - 0.5;
		card.style.setProperty("--tilt-y", `${(ratioX * 5).toFixed(2)}deg`);
		card.style.setProperty("--tilt-x", `${(-ratioY * 3.5).toFixed(2)}deg`);
	};

	window.addEventListener(
		"pointermove",
		(event) => {
			const target = event.target as HTMLElement | null;
			const card = target?.closest<HTMLElement>(".card");
			if (!card) return;
			active = card;
			pointX = event.clientX;
			pointY = event.clientY;
			if (!raf) raf = window.requestAnimationFrame(apply);
		},
		{ passive: true },
	);

	// 鼠标离开时把倾斜归零，卡片平滑回到原位
	document.addEventListener(
		"pointerout",
		(event) => {
			const target = event.target as HTMLElement | null;
			const card = target?.closest<HTMLElement>(".card");
			if (!card) return;
			const related = event.relatedTarget as HTMLElement | null;
			if (related && card.contains(related)) return;
			card.style.setProperty("--tilt-x", "0deg");
			card.style.setProperty("--tilt-y", "0deg");
			if (active === card) active = null;
		},
		{ passive: true },
	);
}

/* ---------------- 入口 ---------------- */

export function init() {
	if (!globalReady) {
		initCursorGlow();
		initScrollProgress();
		initHeroParallax();
		initCardLight();
		window.addEventListener("scroll", syncHeader, { passive: true });
		window.addEventListener("scroll", syncToTop, { passive: true });
		globalReady = true;
	}

	initReveal();
	initTypewriter();
	initImageFade();
	initToTop();
	syncHeader();
}
