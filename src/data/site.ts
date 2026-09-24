export const site = {
	title: "Yuki的小窝",
	subtitle: "一切奇迹的起点",
	description: "记录学习和生活的点滴，欢迎一起交流成长。",
	url: "https://yuki666.online",
	/** 动态后端（Cloudflare Worker），发动态、读动态都靠它 */
	momentsApi: "https://moments.yuki666.online",
	/** 评论后端（自建 Twikoo，同样跑在 Cloudflare Worker 上） */
	twikooApi: "https://twikoo.yuki666.online",
	author: "YUKI",
	avatar: "/avatar.avif",
	bio: "在代码与游戏的夹缝里打盹的一只猫，把想记住的东西都存在这里。",
	profileLinks: [
		{ name: "QQ", url: "https://qm.qq.com/q/CBx9EjuB3M" },
		{ name: "GitHub", url: "https://github.com/linmu-uu" },
		{ name: "Email", url: "mailto:2116943621@qq.com" },
		{ name: "BiliBili", url: "https://space.bilibili.com/1612903352" },
	],
	nav: [
		{ label: "首页", href: "/" },
		{ label: "文章", href: "/archive" },
		{ label: "搜索", href: "/search" },
		{ label: "动态", href: "/moments" },
		{ label: "相册", href: "/gallery" },
		{ label: "友链", href: "/friends" },
		{ label: "留言", href: "/guestbook" },
		{ label: "关于", href: "/about" },
	],
	/*
	 * 这里以前有个写死的 stats（posts / tags），发到第 9 篇时数字还停在 3。
	 * 现在首页资料卡（ProfileCard）直接读内容集合现算，别再往这里塞计数了。
	 */
	music: {
		title: "正在播放",
		/**
		 * 远程歌单接口（主人自己的 token 链接）。
		 * 留空就只用 public/audio/ 里的本地文件；
		 * 填上之后会在用户第一次想听歌时懒加载，并缓存在本次会话里。
		 */
		api: "https://music.yuki666.online/playlist?id=6677251084",
		/** 按需取单曲播放地址的接口（远程歌单用；本地文件不需要） */
		urlApi: "https://music.yuki666.online/url",
		/**
		 * 播放列表直接扫 public/audio/ 里的音频文件（往里面丢 mp3 就行）。
		 * 这里只负责给文件起个好听的中文名：键可以是文件名或去掉扩展名的文件名。
		 */
		titles: {
			"bgm.mp3": "使一颗心免于哀伤（哼唱）",
		} as Record<string, string>,
		/** 没有单独封面时用的默认封面 */
		cover: "/audio/cover.webp",
	},
};
