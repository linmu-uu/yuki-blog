import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { site } from "./site";

export interface MusicTrack {
	title: string;
	/** 文件名（不带扩展名），用于和封面图对应 */
	id: string;
	src: string;
	cover: string;
}

const AUDIO_EXT = /\.(mp3|m4a|ogg|opus|flac|wav)$/i;
const COVER_EXT = [".webp", ".avif", ".jpg", ".png"];

/**
 * 播放列表直接从 public/audio/ 扫出来：
 *   - 往里面丢 mp3 → 自动出现在播放列表里
 *   - 想给某首歌起个中文名，就在 src/data/site.ts 的 music.titles 里写一行
 *   - 封面找同名图片（bgm.mp3 → bgm.webp），找不到就用统一的 cover.webp
 */
function buildPlaylist(): MusicTrack[] {
	const dir = path.resolve("public/audio");
	let files: string[] = [];
	try {
		files = readdirSync(dir).filter((name) => AUDIO_EXT.test(name)).sort();
	} catch {
		return [];
	}

	const titles = site.music.titles ?? {};

	return files.map((name) => {
		const id = name.replace(AUDIO_EXT, "");
		const ownCover = COVER_EXT.map((ext) => path.join(dir, `${id}${ext}`)).find((file) =>
			existsSync(file),
		);
		const coverName = ownCover ? path.basename(ownCover) : path.basename(site.music.cover);

		return {
			title: titles[name] ?? titles[id] ?? id,
			id,
			src: `/audio/${name}`,
			cover: `/audio/${coverName}`,
		};
	});
}

/** 本地 public/audio/ 里的音频（没有文件时是空数组） */
export const localTracks = buildPlaylist();
