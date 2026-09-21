/**
 * 给桌面壁纸生成一套 1600px 的小尺寸版本，配合 srcset 让浏览器自己挑：
 * 1080p/1440p 的屏幕拿小图（约省一半流量），2K/4K 或高分屏才拿 2560 的大图。
 *
 * 直接读现有的 public/wallpaper/desktop/*.avif 重新编码，不需要原始大图。
 *
 * 用法：npm run wallpapers:variants
 */

import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.resolve("public/wallpaper/desktop");
const WIDTH = 1600;
const QUALITY = 58;

async function main() {
	const entries = (await readdir(DIR)).filter((name) => /^ba-desktop-\d+\.avif$/.test(name));
	if (!entries.length) {
		console.log(`没有找到桌面壁纸：${DIR}`);
		return;
	}

	// 重新导入壁纸后编号会变，清掉原图已经不存在的小图，免得一直传上去
	const stale = (await readdir(DIR)).filter(
		(name) =>
			/^ba-desktop-\d+-1600\.avif$/.test(name) &&
			!entries.includes(name.replace(/-1600\.avif$/, ".avif")),
	);
	for (const name of stale) {
		await rm(path.join(DIR, name), { force: true });
		console.log(`删除过期小图 ${name}`);
	}

	for (const name of entries) {
		const source = path.join(DIR, name);
		const target = path.join(DIR, name.replace(/\.avif$/, `-${WIDTH}.avif`));
		const meta = await sharp(source).metadata();

		// 原图本来就比目标小的话就别放大了
		if ((meta.width ?? 0) <= WIDTH) {
			console.log(`跳过 ${name}（原始宽度 ${meta.width} 已经小于 ${WIDTH}）`);
			continue;
		}

		await sharp(source)
			.resize({ width: WIDTH, withoutEnlargement: true })
			.avif({ quality: QUALITY, effort: 4 })
			.toFile(target);

		const before = (await stat(source)).size;
		const after = (await stat(target)).size;
		console.log(
			`${name} → ${path.basename(target)}  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`,
		);
	}
}

await main();
