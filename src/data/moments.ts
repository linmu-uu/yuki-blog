import raw from "./moments.json";

export interface Moment {
	/** 发布时间，格式 "2026-09-21 23:40" */
	date: string;
	/** 正文，支持换行 */
	content: string;
	/** 配图路径，1-4 张会排成网格 */
	images?: string[];
	/** 标签 */
	tags?: string[];
	/** 心情 */
	mood?: string;
}

/**
 * 动态列表（新的在最上面）。
 *
 * 数据存在同目录的 moments.json 里 —— 用 `npm run admin` 打开可视化后台就能发动态，
 * 不需要手动改代码喵。
 */
export const moments = raw as Moment[];
