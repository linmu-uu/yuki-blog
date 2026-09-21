/**
 * 给相册图生成小尺寸缩略图：
 *   public/gallery/<相册>/1.avif       → 1-thumb.avif      （560px 宽，网格用）
 *   public/gallery/<相册>/cover.avif   → cover-thumb.avif  （320px 宽，相册头部用）
 *
 * 网格里每张图只显示两百多像素宽，直接下 1600px 原图太浪费；
 * 点开大图时仍然加载原图（lightbox 用的是 data-full）。
 *
 * 已经生成过、且比原图新的缩略图会跳过，可以反复执行。
 *
 * 用法：npm run gallery:thumbs
 */

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("public/gallery");
const GRID_WIDTH = 560;
const COVER_WIDTH = 320;
const QUALITY = 60;

async function newerThan(target, source) {
	try {
		const [targetStat, sourceStat] = await Promise.all([stat(target), stat(source)]);
		return targetStat.mtimeMs >= sourceStat.mtimeMs;
	} catch {
		return false;
	}
}

async function main() {
	const albums = await readdir(ROOT, { withFileTypes: true });
	let made = 0;

	for (const album of albums) {
		if (!album.isDirectory()) continue;
		const dir = path.join(ROOT, album.name);

		for (const name of await readdir(dir)) {
			if (!name.endsWith(".avif") || name.includes("-thumb.")) continue;

			const source = path.join(dir, name);
			const target = path.join(dir, name.replace(/\.avif$/, "-thumb.avif"));
			if (await newerThan(target, source)) continue;

			const width = name.startsWith("cover") ? COVER_WIDTH : GRID_WIDTH;
			await sharp(source)
				.resize({ width, withoutEnlargement: true })
				.avif({ quality: QUALITY, effort: 4 })
				.toFile(target);

			const before = (await stat(source)).size;
			const after = (await stat(target)).size;
			made += 1;
			console.log(
				`${album.name}/${name} → ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`,
			);
		}
	}

	console.log(made ? `生成 ${made} 张缩略图` : "缩略图都是最新的，没有需要生成的");
}

await main();
