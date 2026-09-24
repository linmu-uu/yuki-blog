/**
 * 把 AI 生成的二次元壁纸接进站点。
 *
 * 输入：优先 `output/imagegen-hires/*.png`（ComfyUI + 4x-AnimeSharp 放大过的高清图），
 *       没有就用 `output/imagegen/*.png`（imagegen 直出）。
 * 输出（都在 public/wallpaper/ 下）：
 *   desktop/ai-desktop-NN.avif        3840 宽（4K 屏的母版，也当"够用就选它"的兜底）
 *   desktop/ai-desktop-NN-2560.avif   2560 宽（2K 屏 / 150% 缩放屏，主人这台就吃这档）
 *   desktop/ai-desktop-NN-1600.avif   1600 宽（1080p / 1440p）
 *   mobile/ai-mobile-NN.avif          1080×1920 竖版（按 FOCAL_X 手动焦点裁切）
 *
 * 另外写 `src/data/wallpaper-sizes.json`，把每张图真实的候选尺寸交给 srcset，
 * 省得在 background.ts 里猜宽度（老壁纸宽度参差不齐，猜出来的描述符是错的）。
 *
 * 处理完跑 `npm run wallpapers:palette` 让新壁纸也有配色，然后 `npm run deploy`。
 *
 * 用法：npm run wallpapers:ai
 */

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const HIRES = path.resolve("output/imagegen-hires");
const SRC = path.resolve("output/imagegen");
const OUT_DESKTOP = path.resolve("public/wallpaper/desktop");
const OUT_MOBILE = path.resolve("public/wallpaper/mobile");
const SIZES_FILE = path.resolve("src/data/wallpaper-sizes.json");

const DESKTOP_WIDTH = 3840;
const MID_WIDTH = 2560;
const SMALL_WIDTH = 1600;
const MOBILE = { width: 1080, height: 1920 };
const QUALITY = 62;

/**
 * 转码前的轻度 unsharp。
 *
 * 上一版（直出图）用的是 sigma 0.8；这一版先过了 AI 放大，边缘本来就被强化过，
 * 所以强度减半，只压一下缩放带来的软，不留白边。
 */
const SHARPEN = { sigma: 0.5, m1: 0.5, m2: 1.6, x1: 2, y2: 8, y3: 16 };

/**
 * 竖版裁切时人物应该落在哪个横向位置（0 = 最左，1 = 最右）。
 *
 * 默认用 sharp 的 attention 策略找重心，但实测会被霓虹灯牌、大片天空带偏：
 * 白子那张只剩一只手、星野那张整张都是天空（人物被裁掉了）。
 * 所以每张图手动给一个焦点，键名是源文件名（不带扩展名、不带 -hires 后缀）。
 * 没列到的图仍然走自动策略。
 */
const FOCAL_X = {
	"01-shiroko-neon-night": 0.46,
	"02-yuuka-window": 0.5,
	"03-hoshino-sunset": 0.77,
	"04-trinity-cathedral": 0.52,
};

const keyOf = (name) => name.replace(/\.(png|jpg|jpeg|webp)$/i, "").replace(/-hires$/, "");

async function pickSourceDir() {
	for (const dir of [HIRES, SRC]) {
		try {
			const files = (await readdir(dir))
				.filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
				.sort();
			if (files.length) return { dir, files };
		} catch {
			// 目录不存在就试下一个
		}
	}
	return { dir: null, files: [] };
}

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

const { dir: sourceDir, files: entries } = await pickSourceDir();
if (!sourceDir) {
	console.log(`还没有生成结果：${HIRES} 和 ${SRC} 里都没有图，先跑 imagegen / ComfyUI 出图吧`);
	process.exit(0);
}

console.log(`源目录：${sourceDir}（${entries.length} 张）`);
await cleanup();

const sizes = {};
let index = 0;
for (const name of entries) {
	index += 1;
	const stamp = String(index).padStart(2, "0");
	const source = path.join(sourceDir, name);

	const masterFile = path.join(OUT_DESKTOP, `ai-desktop-${stamp}.avif`);
	const midFile = path.join(OUT_DESKTOP, `ai-desktop-${stamp}-${MID_WIDTH}.avif`);
	const smallFile = path.join(OUT_DESKTOP, `ai-desktop-${stamp}-${SMALL_WIDTH}.avif`);
	const mobileFile = path.join(OUT_MOBILE, `ai-mobile-${stamp}.avif`);

	const meta = await sharp(source).metadata();
	if ((meta.width ?? 0) < DESKTOP_WIDTH) {
		console.log(`  ! ${name} 只有 ${meta.width} 宽，够不到 ${DESKTOP_WIDTH}，先放大再来`);
	}

	await sharp(source)
		.resize({ width: DESKTOP_WIDTH, withoutEnlargement: false })
		.sharpen(SHARPEN)
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(masterFile);

	await sharp(source)
		.resize({ width: MID_WIDTH, withoutEnlargement: false })
		.sharpen(SHARPEN)
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(midFile);

	await sharp(source)
		.resize({ width: SMALL_WIDTH, withoutEnlargement: false })
		.sharpen(SHARPEN)
		.avif({ quality: QUALITY, effort: 4 })
		.toFile(smallFile);

	// 竖版：按 9:16 裁一块竖条，再缩到 1080×1920
	const focus = FOCAL_X[keyOf(name)];
	let mobilePipeline;
	if (focus === undefined) {
		// 没配焦点就走 sharp 的自动重心
		mobilePipeline = sharp(source).resize({
			width: MOBILE.width,
			height: MOBILE.height,
			fit: "cover",
			position: sharp.strategy.attention,
		});
	} else {
		const width = meta.width ?? 0;
		const height = meta.height ?? 0;
		const cropWidth = Math.round((height * MOBILE.width) / MOBILE.height);
		const left = Math.min(
			Math.max(Math.round(width * focus - cropWidth / 2), 0),
			Math.max(width - cropWidth, 0),
		);
		mobilePipeline = sharp(source)
			.extract({ left, top: 0, width: Math.min(cropWidth, width), height })
			.resize({ width: MOBILE.width, height: MOBILE.height });
	}

	await mobilePipeline.sharpen(SHARPEN).avif({ quality: QUALITY, effort: 4 }).toFile(mobileFile);

	const url = `/wallpaper/desktop/ai-desktop-${stamp}.avif`;
	sizes[url] = {
		width: DESKTOP_WIDTH,
		candidates: [
			{ src: `/wallpaper/desktop/ai-desktop-${stamp}-${SMALL_WIDTH}.avif`, w: SMALL_WIDTH },
			{ src: `/wallpaper/desktop/ai-desktop-${stamp}-${MID_WIDTH}.avif`, w: MID_WIDTH },
			{ src: url, w: DESKTOP_WIDTH },
		],
	};

	const kb = (file) => (file / 1024).toFixed(0);
	console.log(
		`${name.padEnd(34)} 3840 ${kb((await stat(masterFile)).size)}KB / 2560 ${kb((await stat(midFile)).size)}KB / 1600 ${kb((await stat(smallFile)).size)}KB / 手机 ${kb((await stat(mobileFile)).size)}KB`,
	);
}

await writeFile(SIZES_FILE, `${JSON.stringify(sizes, null, "\t")}\n`, "utf8");

console.log(`\n处理完成：${index} 张 → public/wallpaper/
尺寸表已写入：${path.relative(process.cwd(), SIZES_FILE)}
下一步：npm run wallpapers:palette && npm run deploy`);
