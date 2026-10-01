/**
 * 「相关文章」的挑选逻辑。
 *
 * 打分很简单，够用就行：
 *   - 共同标签每个 ×3（标签是作者自己打的，最能说明主题）
 *   - 同一分类 ×2（分类比标签粗，权重低一点）
 *   - 分数相同就按发布时间新的在前
 * 分数为 0 的直接不出现 —— 宁可少推几篇，也不硬凑一堆不相关的。
 */
import type { PostEntry } from "./tags";

export function relatedPosts(current: PostEntry, posts: PostEntry[], limit = 3): PostEntry[] {
	const currentTags = new Set(current.data.tags);

	return posts
		.filter((post) => post.id !== current.id)
		.map((post) => {
			const sharedTags = post.data.tags.filter((tag) => currentTags.has(tag)).length;
			const sameCategory =
				current.data.category !== "" && post.data.category === current.data.category;
			return { post, score: sharedTags * 3 + (sameCategory ? 2 : 0) };
		})
		.filter((item) => item.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.post.data.published.valueOf() - a.post.data.published.valueOf(),
		)
		.slice(0, limit)
		.map((item) => item.post);
}
