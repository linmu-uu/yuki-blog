/**
 * 扫描 public/wallpaper/desktop/，把"每张母版的真实宽度 + 现存的候选尺寸"
 * 写进 src/data/wallpaper-sizes.json，供背景清单生成 srcset。
 *
 * 为什么要这个：老代码给所有桌面图都写死 `2560w`，但 ba-* 里有好几张实际只有
 * 1920/2000/2338 宽——描述符和事实不符，浏览器会挑错档。
 *
 * 用法：npm run wallpapers:sizes（加图/重新导入之后跑一次）
 */

import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.resolve("public/wallpaper/desktop");
const FILE = path.resolve("src/data/wallpaper-sizes.json");

const files = await readdir(DIR);
// 母版：ba-desktop-01.avif / ai-desktop-01.avif；候选：*-1600.avif / *-2560.avif / *-3840.avif
const masters = files.filter((name) => name.endsWith(".avif") && !/-\d{3,4}\.avif$/.test(name)).sort();

const table = {};
for (const name of masters) {
	const meta = await sharp(path.join(DIR, name)).metadata();
	const width = meta.width ?? 0;
	const url = `/wallpaper/desktop/${name}`;

	const candidates = [];
	for (const preset of [1600, 2560, 3840]) {
		const variant = name.replace(/\.avif$/, `-${preset}.avif`);
		if (files.includes(variant)) {
			candidates.push({ src: `/wallpaper/desktop/${variant}`, w: preset });
		}
	}
	candidates.push({ src: url, w: width });

	table[url] = { width, candidates };
	console.log(
		`${name.padEnd(28)} ${String(width).padStart(5)}px  候选 ${candidates.map((c) => c.w).join("/")}`,
	);
}

await writeFile(FILE, `${JSON.stringify(table, null, "\t")}\n`, "utf8");
console.log(`\n共 ${masters.length} 张母版，尺寸表已写入 ${path.relative(process.cwd(), FILE)}`);
