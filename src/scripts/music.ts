/**
 * 全站共用的音乐播放器（单例）
 *
 * 关键点：audio 元素**不挂到 DOM 上**，而是模块里自己 hold 一个实例。
 * Astro 的 ClientRouter 切页面时只会替换 DOM，不会重跑模块，
 * 所以音乐能跨页面一直放，灵动岛和侧边栏卡片共用同一个播放器、状态永远同步。
 */

export interface MusicTrack {
	title: string;
	src: string;
	cover: string;
}

export interface MusicState {
	tracks: MusicTrack[];
	index: number;
	playing: boolean;
	time: number;
	duration: number;
	ready: boolean;
	error: string;
}

type Listener = (state: MusicState) => void;

const STORAGE_KEY = "yuki:music";

let tracks: MusicTrack[] = [];
let index = 0;
let audio: HTMLAudioElement | null = null;
let ready = false;
let error = "";
let saveTimer = 0;

const listeners = new Set<Listener>();

function snapshot(): MusicState {
	return {
		tracks,
		index,
		playing: Boolean(audio && !audio.paused),
		time: audio?.currentTime ?? 0,
		duration: Number.isFinite(audio?.duration ?? NaN) ? (audio?.duration ?? 0) : 0,
		ready,
		error,
	};
}

function emit() {
	const state = snapshot();
	for (const listener of listeners) listener(state);
}

function persist() {
	if (!audio) return;
	window.clearTimeout(saveTimer);
	saveTimer = window.setTimeout(() => {
		try {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ index, time: audio?.currentTime ?? 0 }),
			);
		} catch {
			// 隐私模式下写不了就算了
		}
	}, 400);
}

function restore() {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw) as { index?: number; time?: number };
		if (typeof saved.index === "number" && saved.index >= 0 && saved.index < tracks.length) {
			index = saved.index;
		}
		if (typeof saved.time === "number" && audio) {
			audio.currentTime = saved.time;
		}
	} catch {
		// 解析失败就当没存过
	}
}

function loadTrack(autoplay: boolean) {
	if (!audio) return;
	const track = tracks[index];
	if (!track) return;

	audio.src = track.src;
	error = "";
	ready = false;
	audio.preload = "metadata";
	audio.load();
	emit();

	if (autoplay) void play();
}

/** 配置播放列表（只认第一次，之后走模块内的状态，切页面不会重置） */
export function configureMusic(list: MusicTrack[]) {
	if (!audio) createAudio();
	if (!tracks.length && list.length) tracks = list;
	restore();
	emit();
}

function createAudio() {
	audio = new Audio();
	audio.preload = "none";
	audio.addEventListener("loadedmetadata", () => {
		ready = true;
		emit();
	});
	audio.addEventListener("timeupdate", () => {
		emit();
		persist();
	});
	audio.addEventListener("play", emit);
	audio.addEventListener("pause", emit);
	audio.addEventListener("ended", () => {
		next();
	});
	audio.addEventListener("error", () => {
		error = "音频加载失败";
		emit();
	});
}

export function subscribeMusic(listener: Listener) {
	listeners.add(listener);
	listener(snapshot());
	return () => listeners.delete(listener);
}

export function getMusicState() {
	return snapshot();
}

/** 首次播放前才去取数据，省流量；鼠标悬停等「有意图」的动作可以提前调它 */
export function warmUpMusic() {
	if (!audio || ready) return;
	audio.preload = "metadata";
	audio.load();
}

export async function playMusic() {
	if (!audio) return;
	if (!audio.src) {
		loadTrack(false);
	}
	try {
		await audio.play();
		error = "";
	} catch {
		error = "播放失败了，再点一下试试";
	}
	emit();
}

export function pauseMusic() {
	audio?.pause();
	emit();
}

export function toggleMusic() {
	if (audio && !audio.paused) pauseMusic();
	else void playMusic();
}

export function nextMusic() {
	if (tracks.length < 2) {
		// 只有一首歌就重头放，别停
		if (audio) audio.currentTime = 0;
		return;
	}
	index = (index + 1) % tracks.length;
	loadTrack(true);
}

export function prevMusic() {
	if (tracks.length < 2) {
		if (audio) audio.currentTime = 0;
		return;
	}
	index = (index - 1 + tracks.length) % tracks.length;
	loadTrack(true);
}

export function selectTrack(next: number) {
	if (next < 0 || next >= tracks.length) return;
	if (next === index && audio && !audio.paused) return;
	index = next;
	loadTrack(true);
}

export function seekMusic(ratio: number) {
	if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
	const target = Math.min(Math.max(ratio, 0), 1) * audio.duration;
	audio.currentTime = target;
	emit();

	/*
	 * Cloudflare 的静态资源不返回 Accept-Ranges，远端音频可能「跳不动」：
	 * 落点如果和预期差很多，就明确提示一次，别让人以为点了没反应。
	 */
	window.setTimeout(() => {
		if (!audio) return;
		if (Math.abs(audio.currentTime - target) > 1.5 && target > 2) {
			error = "这首曲子暂时不支持拖动进度，让它自己放吧～";
			emit();
			window.setTimeout(() => {
				if (error.startsWith("这首曲子")) {
					error = "";
					emit();
				}
			}, 5000);
		}
	}, 500);

	return target;
}

/* -------------------------------------------------------------------------
 * 远程歌单
 *
 * 主人是「token 链接到歌单」这种玩法，所以这里不写死某一家：
 * 把接口地址配到 src/data/site.ts 的 music.api，返回的 JSON 只要能翻出
 * 「一组带 url 的曲目」就能用（Meting / NeteaseCloudMusicApi / 自建接口都覆盖）。
 * 拉取是懒加载 + sessionStorage 缓存，不会拖慢首屏。
 * ---------------------------------------------------------------------- */

const REMOTE_CACHE_KEY = "yuki:music-playlist";

/** 从各种常见返回结构里翻出曲目数组 */
function pickArray(payload: unknown): Record<string, unknown>[] {
	if (Array.isArray(payload)) return payload as Record<string, unknown>[];
	if (payload && typeof payload === "object") {
		const object = payload as Record<string, unknown>;
		for (const key of ["data", "songs", "tracks", "result", "playlist"]) {
			const value = object[key];
			if (Array.isArray(value)) return value as Record<string, unknown>[];
			if (value && typeof value === "object") {
				const nested = pickArray(value);
				if (nested.length) return nested;
			}
		}
	}
	return [];
}

function pickString(item: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = item[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
}

/** 把接口返回的一条记录规整成播放器认识的曲目 */
function toTrack(item: Record<string, unknown>, fallbackCover: string): MusicTrack | null {
	const src = pickString(item, ["url", "src", "link", "songUrl", "playUrl"]);
	if (!src) return null;

	const title = pickString(item, ["name", "title", "songName", "songname"]) || "未命名曲目";
	const artist = pickString(item, ["artist", "singer", "author", "artists"]);
	const cover = pickString(item, ["pic", "cover", "image", "albumPic"]) || fallbackCover;

	return { title: artist ? `${title} - ${artist}` : title, src, cover };
}

function readRemoteCache(): MusicTrack[] | null {
	try {
		const raw = sessionStorage.getItem(REMOTE_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as MusicTrack[];
		return Array.isArray(parsed) && parsed.length ? parsed : null;
	} catch {
		return null;
	}
}

function writeRemoteCache(list: MusicTrack[]) {
	try {
		sessionStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(list));
	} catch {
		// 隐私模式就算了
	}
}

let remoteLoading: Promise<MusicTrack[]> | null = null;

/** 懒加载远程歌单：首次拿会话缓存，没缓存才真的去请求 */
export function loadRemotePlaylist(api: string, fallbackCover: string): Promise<MusicTrack[]> {
	if (!api) return Promise.resolve([]);
	if (remoteLoading) return remoteLoading;

	const cached = readRemoteCache();
	if (cached) {
		applyPlaylist(cached);
		remoteLoading = Promise.resolve(cached);
		return remoteLoading;
	}

	remoteLoading = fetch(api, { credentials: "omit" })
		.then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
		.then((payload) => {
			const tracks = pickArray(payload)
				.map((item) => toTrack(item, fallbackCover))
				.filter((track): track is MusicTrack => Boolean(track));
			if (tracks.length) {
				writeRemoteCache(tracks);
				applyPlaylist(tracks);
			}
			return tracks;
		})
		.catch((reason) => {
			error = "歌单加载失败，稍后再试";
			console.warn("[music] 远程歌单加载失败：", reason);
			emit();
			return [];
		});

	return remoteLoading;
}

/** 用一份新的列表替换播放列表（尽量保住当前播放的这首歌） */
export function applyPlaylist(list: MusicTrack[]) {
	if (!list.length) return;
	const currentSrc = tracks[index]?.src;
	tracks = list;

	const wasPlaying = Boolean(audio && !audio.paused);
	index = currentSrc ? Math.max(0, list.findIndex((track) => track.src === currentSrc)) : 0;

	if (!audio) createAudio();

	if (wasPlaying) loadTrack(true);
	else {
		ready = false;
		emit();
	}
}
