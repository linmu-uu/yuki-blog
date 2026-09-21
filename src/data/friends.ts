export interface FriendLink {
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags?: string[];
	weight?: number;
}

// 友链列表：想加朋友就在这里追加一项
export const friends: FriendLink[] = [
	{
		title: "小高拐拐の小窝",
		imgurl: "https://www.xn--yet00na8848c.top/favicon/favicon.ico",
		desc: "记录生活，分享技术，随心度日",
		siteurl: "https://www.xn--yet00na8848c.top",
		tags: ["Blog"],
		weight: 6,
	},
	{
		title: "夏夜流萤",
		imgurl: "https://weavatar.com/avatar/d252655d40d6874417a720bad0a6c5f77f8f6a1fd2f882f8f338402dc37e4190?s=640",
		desc: "飞萤之火自无梦的长夜亮起，绽放在终竟的明天。",
		siteurl: "https://blog.cuteleaf.cn",
		tags: ["Blog"],
		weight: 10,
	},
	{
		title: "Astro",
		imgurl: "https://avatars.githubusercontent.com/u/44914786?v=4&s=640",
		desc: "The web framework for content-driven websites. ⭐️ Star to support our work!",
		siteurl: "https://github.com/withastro/astro",
		tags: ["Framework"],
		weight: 8,
	},
	{
		title: "悍匪组队交流群",
		imgurl: "https://cdn.phototourl.com/free/2026-05-03-1298aca6-35d3-4348-bde0-39a6c12524b3.jpg",
		desc: "为了更强大的力量，加入我们吧！",
		siteurl: "https://qun.qq.com/universal-share/share?ac=1&authKey=VAuUWJwnPj%2FmlQhPgmCHez0ZvlNRsc8gkRdZhck7wowM2nA3HiH1bZVyaFcCV%2FQ0&busi_data=eyJncm91cENvZGUiOiIxMDc3NjkxMzY3IiwidG9rZW4iOiJCSHpHUlJlMVRqTVc5emY5c1ppeXZ6MXM3ODh0eStRcjBrWE1DRHpiUWF5UFAwQlN3ZW9Id09WZ3RvbGxWSC93IiwidWluIjoiMjExNjk0MzYyMSJ9&data=1Q8HIqxCv5oKO5zW5RC4tDLEMp9QQWQn_mBVAVJHkVt1gVXH9IModeCi5xAEBLpyNGBIrC1LReV8sysMv7-rFw&svctype=4&tempid=h5_group_info",
		tags: ["组队交流群"],
		weight: 5,
	},
	{
		title: "𝐴𝑢𝑟𝑜𝑟𝑎交流群",
		imgurl: "https://cdn.phototourl.com/free/2026-05-03-74c6ea78-c9e7-46d6-9149-99709c9b7cf3.jpg",
		desc: "HVH 交流群，欢迎加入！",
		siteurl: "https://qm.qq.com/q/kcwm9MHsRO",
		tags: ["组队交流群"],
		weight: 4,
	},
];

export const sortedFriends = [...friends].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
