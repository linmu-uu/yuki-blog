/**
 * 给动态壁纸的资源名加上内容哈希：mv-desktop-01.avif → mv-desktop-01-a1b2c3d4.avif
 *
 * 为什么必须这么干：`/wallpaper/*` 缓存一天，文件名不变的话，换了内容浏览器和边缘节点
 * 还是发旧的那份 —— 主人就遇到了「明明踢掉的莉可丽丝、露西亚又出现了，新加的却看不到」。
 * 名字里带哈希之后，内容一改 URL 就变，缓存自然失效。
 *
 * 四份资源（桌面视频 / 手机视频 / 桌面海报 / 海报小图 / 手机海报）用同一个哈希后缀，
 * 由桌面视频的内容决定；已经带哈希的会跳过（幂等）。
 *
 * 用法：npm run wallpapers:hash
 */
import { createHash } from "node:crypto";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const VIDEO_DIR = path.resolve("public/wallpaper/video");
const DESKTOP = path.resolve("public/wallpaper/desktop");
const MOBILE = path.resolve("public/wallpaper/mobile");
const MANIFEST = path.resolve("src/data/wallpaper-videos.json");

const HASHED = /-[0-9a-f]{8}\.(mp4|avif)$/;

const hashOf = async (file) => {
	const data = await readFile(file);
	return createHash("sha1").update(data).digest("hex").slice(0, 8);
};

const exists = async (file) => {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
};

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const next = {};

for (const name of (await readdir(VIDEO_DIR)).filter((n) => /^mv-desktop-\d+.*\.mp4$/.test(n)).sort()) {
	const match = name.match(/^mv-desktop-(\d+)/);
	const stamp = match[1];
	const desktopVideo = path.join(VIDEO_DIR, name);
	const hash = HASHED.test(name) ? name.match(/-([0-9a-f]{8})\.mp4$/)[1] : await hashOf(desktopVideo);

	const suffix = `-${hash}`;
	const pairs = [
		[path.join(VIDEO_DIR, `mv-desktop-${stamp}.mp4`), path.join(VIDEO_DIR, `mv-desktop-${stamp}${suffix}.mp4`)],
		[path.join(VIDEO_DIR, `mv-mobile-${stamp}.mp4`), path.join(VIDEO_DIR, `mv-mobile-${stamp}${suffix}.mp4`)],
		[path.join(DESKTOP, `mv-desktop-${stamp}.avif`), path.join(DESKTOP, `mv-desktop-${stamp}${suffix}.avif`)],
		[path.join(DESKTOP, `mv-desktop-${stamp}-1600.avif`), path.join(DESKTOP, `mv-desktop-${stamp}${suffix}-1600.avif`)],
		[path.join(MOBILE, `mv-mobile-${stamp}.avif`), path.join(MOBILE, `mv-mobile-${stamp}${suffix}.avif`)],
	];

	for (const [from, to] of pairs) {
		if (from === to) continue;
		if (!(await exists(from))) continue;
		if (await exists(to)) continue;
		await rename(from, to);
	}

	const posterKey = `/wallpaper/desktop/mv-desktop-${stamp}${suffix}.avif`;
	const entry = manifest[`/wallpaper/desktop/mv-desktop-${stamp}.avif`] ?? manifest[posterKey];
	if (!entry) continue;
	next[posterKey] = {
		...entry,
		desktop: `/wallpaper/video/mv-desktop-${stamp}${suffix}.mp4`,
		mobile: `/wallpaper/video/mv-mobile-${stamp}${suffix}.mp4`,
	};
}

await writeFile(MANIFEST, `${JSON.stringify(next, null, "\t")}\n`, "utf8");
console.log(`已处理 ${Object.keys(next).length} 张动态壁纸（带哈希后缀）`);
