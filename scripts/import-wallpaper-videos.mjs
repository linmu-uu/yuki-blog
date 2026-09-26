/**
 * 把「视频壁纸」接进站点（壁纸引擎的 video 型壁纸、或者任何 mp4/webm）。
 *
 * 思路：视频当母版，另抽一帧当**静态海报**。海报走现有的壁纸管线（配色 / srcset /
 * 缓存策略全复用），所以手机、省流、开了「减弱动效」的用户看到的还是那张海报，
 * 只有符合条件的设备才会真正下载视频。
 *
 * 产出：
 *   public/wallpaper/video/mv-desktop-NN.mp4        1920 宽（默认 10 秒、无音轨、faststart）
 *   public/wallpaper/video/mv-mobile-NN.mp4         1280 宽（手机用，浏览器自己裁）
 *   public/wallpaper/desktop/mv-desktop-NN.avif     海报（2560 宽）
 *   public/wallpaper/desktop/mv-desktop-NN-1600.avif 海报小图
 *   public/wallpaper/mobile/mv-mobile-NN.avif       竖版海报（1080×1920）
 *   src/data/wallpaper-videos.json                  海报 → 视频的对应关系
 *
 * 用法：
 *   node scripts/import-wallpaper-videos.mjs --we 845482931 3016249513   # 直接点名工坊 id
 *   node scripts/import-wallpaper-videos.mjs D:/wallpapers/video         # 或者给个目录
 *   # 可选：--duration 8 --width 1920 --crf 30
 */

import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import sharp from "sharp";

const run = promisify(execFile);

const WORKSHOP = "D:/uuuj/steamapps/workshop/content/431960";
const OUT_VIDEO = path.resolve("public/wallpaper/video");
const OUT_DESKTOP = path.resolve("public/wallpaper/desktop");
const OUT_MOBILE = path.resolve("public/wallpaper/mobile");
const MANIFEST = path.resolve("src/data/wallpaper-videos.json");

const argv = process.argv.slice(2);
const flagValues = (name, fallback) => {
	const index = argv.indexOf(name);
	return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const DURATION = Number(flagValues("--duration", "7"));
/*
 * 桌面 2560 宽：主人的屏是 2560×1600 @150%，首屏大图要 2560 设备像素；
 * 早先压 1920 会被浏览器放大 1.33 倍看得很糊。CRF 26 + tune animation 是
 * 画质/体积的折中点（实测 4K 源 6 秒 ≈ 2.2MB）。
 */
const WIDTH = Number(flagValues("--width", "2560"));
const MOBILE_WIDTH = Number(flagValues("--mobile-width", "1280"));
const CRF = Number(flagValues("--crf", "27"));
const RESET = argv.includes("--reset");

/** 收集要处理的源：--we 给的工坊 id，或者命令行里的目录 */
const workshopIds = [];
for (let i = 0; i < argv.length; i += 1) {
	if (argv[i] === "--we") {
		let j = i + 1;
		while (j < argv.length && !argv[j].startsWith("--")) {
			workshopIds.push(argv[j]);
			j += 1;
		}
	}
}
const dirArg = argv.find((arg, index) => !arg.startsWith("--") && argv[index - 1] !== "--we" && argv[index - 1] !== "--duration" && argv[index - 1] !== "--width" && argv[index - 1] !== "--mobile-width" && argv[index - 1] !== "--crf");

const sources = [];
const findVideoIn = async (dir) => {
	const files = await readdir(dir).catch(() => []);
	return files.find((f) => /\.(mp4|webm|mov|mkv)$/i.test(f)) ?? null;
};

for (const id of workshopIds) {
	const dir = path.join(WORKSHOP, id);
	const video = await findVideoIn(dir);
	let title = "";
	try {
		title = JSON.parse(await readFile(path.join(dir, "project.json"), "utf8")).title ?? "";
	} catch {
		// 没 project.json 就用 id 当标题
	}
	if (!video) {
		console.log(`！${id} 里没有视频文件（可能是场景型 .pkg），跳过`);
		continue;
	}
	sources.push({ file: path.join(dir, video), title: title || id, source: `workshop:${id}` });
}

if (dirArg) {
	const dir = path.resolve(dirArg);
	const files = await readdir(dir).catch(() => []);
	for (const name of files.filter((f) => /\.(mp4|webm|mov|mkv)$/i.test(f)).sort()) {
		sources.push({ file: path.join(dir, name), title: path.parse(name).name, source: `file:${name}` });
	}
}

if (!sources.length) {
	console.log("没有找到要处理的视频。用 --we <工坊id> 或给一个目录路径。");
	process.exit(0);
}

await mkdir(OUT_VIDEO, { recursive: true });
await mkdir(OUT_DESKTOP, { recursive: true });
await mkdir(OUT_MOBILE, { recursive: true });

let manifest = {};
try {
	manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
} catch {
	// 第一次跑，还没有清单
}

// --reset：清掉已有的视频、海报和清单，整批重来（换编码参数时用这个）
if (RESET) {
	const { rm } = await import("node:fs/promises");
	for (const dir of [OUT_VIDEO, OUT_DESKTOP, OUT_MOBILE]) {
		for (const name of await readdir(dir).catch(() => [])) {
			if (name.startsWith("mv-") || /^poster-\d+\.png$/.test(name)) {
				await rm(path.join(dir, name), { force: true });
			}
		}
	}
	manifest = {};
	console.log("--reset：已清空旧的视频 / 海报 / 清单，从 01 重新编号");
}

// 编号接着现有的往后排，方便反复追加
const existing = await readdir(OUT_VIDEO).catch(() => []);
let index = existing.reduce((max, name) => {
	const number = Number(name.match(/mv-desktop-(\d+)\.mp4/)?.[1] ?? 0);
	return Math.max(max, number);
}, 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

for (const { file, title, source } of sources) {
	index += 1;
	const stamp = String(index).padStart(2, "0");

	const probe = await run("ffprobe", [
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height,duration",
		"-of", "json",
		file,
	]);
	const info = JSON.parse(probe.stdout).streams?.[0] ?? {};
	const total = Number(info.duration ?? 0);
	const seconds = Math.min(DURATION, total > 0 ? total : DURATION);

	const desktopVideo = path.join(OUT_VIDEO, `mv-desktop-${stamp}.mp4`);
	const mobileVideo = path.join(OUT_VIDEO, `mv-mobile-${stamp}.mp4`);

	// 桌面：等比缩到 1920 宽（不超过原分辨率），30fps 上限，无音轨，faststart 便于边下边播
	await run("ffmpeg", [
		"-y", "-v", "error",
		"-i", file,
		"-t", String(seconds),
		"-an",
		// 输出宽度取「目标宽度」和「源宽度」里小的那个：1080p 的源不硬放大
		"-vf", `scale='min(${WIDTH},iw)':-2:flags=lanczos,fps=30`,
		"-c:v", "libx264", "-preset", "slow", "-crf", String(CRF), "-tune", "animation",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		desktopVideo,
	]);

	// 手机：同画幅、更小分辨率；竖版裁切交给浏览器（CSS object-fit），比按 9:16 硬裁安全
	await run("ffmpeg", [
		"-y", "-v", "error",
		"-i", file,
		"-t", String(seconds),
		"-an",
		"-vf", `scale='min(${MOBILE_WIDTH},iw)':-2:flags=lanczos,fps=30`,
		"-c:v", "libx264", "-preset", "slow", "-crf", String(CRF + 3), "-tune", "animation",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		mobileVideo,
	]);

	// 海报：取 1 秒处那一帧（开头常有黑场或淡入）
	const posterTime = total > 1.5 ? 1 : seconds / 2;
	const posterPng = path.join(OUT_VIDEO, `poster-${stamp}.png`);
	await run("ffmpeg", ["-y", "-v", "error", "-ss", String(posterTime), "-i", file, "-frames:v", "1", posterPng]);

	const posterDesktop = path.join(OUT_DESKTOP, `mv-desktop-${stamp}.avif`);
	const posterSmall = path.join(OUT_DESKTOP, `mv-desktop-${stamp}-1600.avif`);
	const posterMobile = path.join(OUT_MOBILE, `mv-mobile-${stamp}.avif`);

	await sharp(posterPng)
		.resize({ width: 2560, withoutEnlargement: true })
		.avif({ quality: 62, effort: 4 })
		.toFile(posterDesktop);
	await sharp(posterPng)
		.resize({ width: 1600, withoutEnlargement: true })
		.avif({ quality: 58, effort: 4 })
		.toFile(posterSmall);
	await sharp(posterPng)
		.resize({ width: 1080, height: 1920, fit: "cover", position: "centre" })
		.avif({ quality: 60, effort: 4 })
		.toFile(posterMobile);

	await unlink(posterPng);

	const desktopBytes = (await stat(desktopVideo)).size;
	const mobileBytes = (await stat(mobileVideo)).size;

	manifest[`/wallpaper/desktop/mv-desktop-${stamp}.avif`] = {
		title,
		source,
		duration: Number(seconds.toFixed(2)),
		desktop: `/wallpaper/video/mv-desktop-${stamp}.mp4`,
		mobile: `/wallpaper/video/mv-mobile-${stamp}.mp4`,
		bytes: { desktop: desktopBytes, mobile: mobileBytes },
	};

	console.log(
		`${String(index).padStart(2, "0")}  ${title.slice(0, 24).padEnd(26)} ${info.width}x${info.height} ${seconds.toFixed(1)}s  →  视频 ${kb(desktopBytes)} / ${kb(mobileBytes)}  海报 ${kb((await stat(posterDesktop)).size)}`,
	);
}

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
console.log(`\n清单已更新：${path.relative(process.cwd(), MANIFEST)}（共 ${Object.keys(manifest).length} 条）`);
console.log("下一步：npm run wallpapers:palette && npm run wallpapers:sizes && npm run deploy");
