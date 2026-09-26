/**
 * 把外部壁纸导入项目：压缩成 AVIF、重命名、并同时产出桌面版和手机版。
 *
 * 每张原图都会生成两份：
 *   - 桌面版：保持原比例，最长边压到 2560 宽
 *   - 手机版：居中裁成 9:16 竖版（1080×1920），横图也不会浪费
 *
 * 用法：
 *   npm run wallpapers:import                # 默认读取 D:/wallpapers
 *   node scripts/import-wallpapers.mjs <目录>  # 指定其他目录
 *
 * 输出：public/wallpaper/desktop/ba-desktop-NN.avif
 *      public/wallpaper/mobile/ba-mobile-NN.avif
 *
 * 原始大图（PNG/JPG 好几 MB）转成 AVIF 后通常只有几十到几百 KB，
 * 网站首屏能快很多，而且画质肉眼看不出差别。
 */

import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ARGS = process.argv.slice(2);
/**
 * `--append`：追加模式。默认行为是「清掉已有 ba-*、从 01 重新编号」，
 * 那是为了整目录重新导入时不留垃圾文件；但如果你只是新加了几张图、
 * 放在别的文件夹里想接在后面，就得用追加模式，否则老图全被顶掉。
 */
const APPEND = ARGS.includes("--append");
const srcArg = ARGS.find((arg) => !arg.startsWith("--"));
const SRC = path.resolve(srcArg ?? process.env.WALLPAPER_SRC ?? "D:/wallpapers");
const OUT_DESKTOP = path.resolve("public/wallpaper/desktop");
const OUT_MOBILE = path.resolve("public/wallpaper/mobile");

const EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

async function main() {
	await mkdir(OUT_DESKTOP, { recursive: true });
	await mkdir(OUT_MOBILE, { recursive: true });

	// 先清掉上一次导入的产物，避免编号错乱留下垃圾文件（追加模式跳过）
	if (!APPEND) {
		for (const dir of [OUT_DESKTOP, OUT_MOBILE]) {
			for (const entry of await readdir(dir)) {
				if (/^ba-(desktop|mobile)-\d+\.avif$/.test(entry)) {
					await rm(path.join(dir, entry), { force: true });
				}
			}
		}
	}

	const entries = await readdir(SRC);
	const files = [];
	for (const entry of entries) {
		const full = path.join(SRC, entry);
		const info = await stat(full);
		if (info.isFile() && EXT.has(path.extname(entry).toLowerCase())) files.push(full);
	}

	// 大图优先，让编号好看一点
	files.sort();

	if (!files.length) {
		console.log(`目录里没有图片：${SRC}`);
		return;
	}

	const desktop = [];
	const mobile = [];
	let index = 0;

	if (APPEND) {
		const existing = (await readdir(OUT_DESKTOP)).filter((name) => /^ba-desktop-\d+\.avif$/.test(name));
		index = existing.reduce((max, name) => {
			const number = Number(name.match(/ba-desktop-(\d+)\.avif/)?.[1] ?? 0);
			return Math.max(max, number);
		}, 0);
		console.log(`追加模式：已有 ${index} 张，从 ${index + 1} 开始编号`);
	}

	for (const file of files) {
		const meta = await sharp(file).metadata();
		index += 1;
		const stamp = String(index).padStart(2, "0");

		const desktopFile = path.join(OUT_DESKTOP, `ba-desktop-${stamp}.avif`);
		const mobileFile = path.join(OUT_MOBILE, `ba-mobile-${stamp}.avif`);

		// 桌面版：等比例缩放到宽 2560
		await sharp(file)
			.rotate()
			.resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
			.avif({ quality: 62, effort: 4 })
			.toFile(desktopFile);

		// 手机版：居中裁成 9:16（横图也能裁出可用的竖版）
		await sharp(file)
			.rotate()
			.resize({ width: 1080, height: 1920, fit: "cover", position: "centre", withoutEnlargement: false })
			.avif({ quality: 60, effort: 4 })
			.toFile(mobileFile);

		const before = (await stat(file)).size;
		const dSize = (await stat(desktopFile)).size;
		const mSize = (await stat(mobileFile)).size;

		desktop.push(`/wallpaper/desktop/ba-desktop-${stamp}.avif`);
		mobile.push(`/wallpaper/mobile/ba-mobile-${stamp}.avif`);

		console.log(
			`${String(meta.width) + "x" + String(meta.height)}`.padEnd(12) +
				`${(before / 1024 / 1024).toFixed(2)} MB  →  桌面 ${(dSize / 1024).toFixed(0)} KB / 手机 ${(mSize / 1024).toFixed(0)} KB`,
		);
	}

	console.log(`\n共 ${desktop.length} 张，已同时生成桌面版和手机版喵～`);
}

await main();
