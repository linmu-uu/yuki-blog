/**
 * 把 AI 生成的二次元壁纸接进站点。
 *
 * 输入：output/imagegen/*.png（imagegen 技能 CLI 生成的原图，2560×1440）
 * 输出：
 *   public/wallpaper/desktop/ai-desktop-NN.avif       2560 宽（2K 屏）
 *   public/wallpaper/desktop/ai-desktop-NN-1600.avif  1600 宽（1080p/1440p）
 *   public/wallpaper/mobile/ai-mobile-NN.avif         1080×1920 竖版（自动取视觉重心裁切）
 *
 * 处理完跑 `npm run wallpapers:palette` 让新壁纸也有配色，然后 `npm run deploy`。
 *
 * 用法：npm run wallpapers:ai
 */

import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("output/imagegen");
const OUT_DESKTOP = path.resolve("public/wallpaper/desktop");
const OUT_MOBILE = path.resolve("public/wallpaper/mobile");

const DESKTOP_WIDTH = 2560;
const SMALL_WIDTH = 1600;
const MOBILE = { width: 1080, height: 1920 };
const QUALITY = 62;

async function cleanup() {
	for (const dir of [OUT_DESKTOP, OUT_MOBILE]) {
		await mkdir(dir, { recursive: true });
		for (const entry of await readdir(dir)) {
			if (/^ai-(desktop|mobile)-\d+(-\d+)?\.avif$/.test(entry)) {
				await rm(path.join(dir, entry), { force: true });
			}
		}
	}
}

let entries = [];
try {
	entries = (await readdir(SRC)).filter((name) => /\.png$/i.test(name)).sort();
} catch {
	console.log(`还没有生成结果：${SRC}`);
	process.exit(0);
}

if (!entries.length) {
	console.log(`${SRC} 里没有 png，先跑 imagegen CLI 生成图片吧`);
	process.exit(0);
}

await cleanup();

let index = 0;
for (const name of entries) {
	index += 1;
	const stamp = String(index).padStart(2, "0");
	const source = path.join(SRC, name);

	const desktopFile = path.join(OUT_DESKTOP, `ai-desktop-${stamp}.avif`);
	const smallFile = path.join(OUT_DESKTOP, `ai-desktop-${stamp}-${SMALL_WIDTH}.avif`);
	const mobileFile = path.join(OUT_MOBILE, `ai-mobile-${stamp}.avif`);

	await sharp(source)
		.resize({ width: DESKTOP_WIDTH, withoutEnlargement: false })
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(desktopFile);

	await sharp(source)
		.resize({ width: SMALL_WIDTH, withoutEnlargement: false })
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(smallFile);

	// 竖版：让 sharp 自己找画面重心裁切，避免把人物裁掉
	await sharp(source)
		.resize({
			width: MOBILE.width,
			height: MOBILE.height,
			fit: "cover",
			position: sharp.strategy.attention,
		})
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(mobileFile);

	const desktopSize = (await stat(desktopFile)).size;
	const smallSize = (await stat(smallFile)).size;
	const mobileSize = (await stat(mobileFile)).size;

	console.log(
		`${name.padEnd(34)} 桌面 ${(desktopSize / 1024).toFixed(0)}KB / 小图 ${(smallSize / 1024).toFixed(0)}KB / 手机 ${(mobileSize / 1024).toFixed(0)}KB`,
	);
}

console.log(`\n处理完成：${index} 张 → public/wallpaper/desktop/ai-desktop-*.avif
下一步：npm run wallpapers:palette && npm run deploy`);
