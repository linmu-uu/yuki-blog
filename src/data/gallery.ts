export interface Album {
	id: string;
	name: string;
	description: string;
	location: string;
	date: string;
	tags: string[];
	cover: string;
	images: string[];
}

/**
 * 网格里用的缩略图地址：/gallery/相册/1.avif → /gallery/相册/1-thumb.avif
 * （缩略图由 npm run gallery:thumbs 生成；点开大图时仍然用原图）
 */
export function galleryThumb(src: string): string {
	if (!src.startsWith("/gallery/") || src.includes("-thumb.")) return src;
	return src.replace(/\.avif$/, "-thumb.avif");
}

// 相册：图片放在 public/gallery/<id>/ 目录里
export const albums: Album[] = [
	{
		id: "blue-archive",
		name: "蔚蓝档案",
		description: "一切奇迹的起点。把喜欢的那些画面收在这里。",
		location: "基沃托斯",
		date: "2026-09-21",
		tags: ["蔚蓝档案", "壁纸"],
		cover: "/gallery/blue-archive/cover.avif",
		images: [
			"/gallery/blue-archive/1.avif",
			"/gallery/blue-archive/2.avif",
			"/gallery/blue-archive/3.avif",
			"/gallery/blue-archive/4.avif",
			"/gallery/blue-archive/5.avif",
			"/gallery/blue-archive/6.avif",
			"/gallery/blue-archive/7.avif",
			"/gallery/blue-archive/8.avif",
			"/gallery/blue-archive/9.avif",
		],
	},
	{
		id: "firefly-2026",
		name: "可爱流萤",
		description: "飞萤之火自无梦的长夜亮起，绽放在终竟的明天。",
		location: "崩坏：星穹铁道",
		date: "2026-05-03",
		tags: ["崩坏星穹铁道", "流萤"],
		cover: "/gallery/firefly-2026/cover.avif",
		images: [
			"/gallery/firefly-2026/1.avif",
			"/gallery/firefly-2026/2.avif",
			"/gallery/firefly-2026/3.avif",
			"/gallery/firefly-2026/4.avif",
			"/gallery/firefly-2026/5.avif",
			"/gallery/firefly-2026/6.avif",
			"/gallery/firefly-2026/7.avif",
			"/gallery/firefly-2026/8.avif",
		],
	},
];
