// 站点级预取（自己实现，不依赖 Astro 的 <link rel="prefetch">）
//
// 背景：本站托管在 Cloudflare，国内访问一次往返要 200~600ms。
// Astro 自带的预取是低优先级的 <link rel="prefetch">，国内网络下浏览器常常压着不发，
// 实测加载完 4 秒都还没动静 —— 点了栏目还是要等。
//
// 这里改成页面加载完之后，用 fetch 主动、小并发地把站内页面抓回浏览器缓存
// （HTML 是 max-age=0 + stale-while-revalidate，允许直接复用），
// 于是切栏目时路由那次请求基本命中缓存，不再等跨境往返。

let started = false;

const isSlow = () => {
	const connection = (navigator as unknown as {
		connection?: { saveData?: boolean; effectiveType?: string };
	}).connection;
	if (!connection) return false;
	return Boolean(connection.saveData) || /2g/.test(connection.effectiveType ?? "");
};

// 收集站内链接（跳过当前页、外链、锚点）
function collectTargets() {
	const targets = new Set<string>();
	for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
		const raw = anchor.getAttribute("href");
		if (!raw || raw.startsWith("#")) continue;

		let url: URL;
		try {
			url = new URL(raw, location.href);
		} catch {
			continue;
		}

		if (url.origin !== location.origin) continue;
		if (url.pathname.startsWith("/api/")) continue;
		// 带 ?tag= 之类的筛选页先不预取，把额度留给真正的主栏目
		if (url.search) continue;

		// 我们的页面都是目录式（/moments/）。不补斜杠的话会先吃一个 307 跳转，
		// 白白多一次跨境请求，所以统一成规范形式。
		let pathname = url.pathname;
		if (!pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(pathname)) pathname += "/";
		if (pathname === location.pathname) continue;

		targets.add(pathname);
	}
	return [...targets].slice(0, 8);
}

export function initPrefetch() {
	if (started) return;
	started = true;

	if (isSlow()) return;

	const run = async () => {
		const targets = collectTargets();
		// 两个一组：既比一个一个快，又不会和首屏抢带宽
		for (let index = 0; index < targets.length; index += 2) {
			await Promise.all(
				targets.slice(index, index + 2).map(async (target) => {
					try {
						const response = await fetch(target, {
							credentials: "same-origin",
							priority: "low",
						} as RequestInit);
						// 必须把 body 读完，浏览器才会把它完整写进缓存
						await response.text();
					} catch {
						// 预取失败无所谓，用户点时再正常请求
					}
				}),
			);
		}
	};

	// 等首屏（含壁纸）忙完再开始，别抢 LCP 的带宽
	const start = () => window.setTimeout(() => void run(), 500);
	if (document.readyState === "complete") start();
	else window.addEventListener("load", start, { once: true });
}
