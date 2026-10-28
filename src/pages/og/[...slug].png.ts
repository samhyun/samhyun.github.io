import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORY_LABELS } from '../../consts';
import { renderOgImage, OG_CATEGORY_COLORS } from '../../utils/og';

// 빌드 타임에 글별 OG 이미지(1200x630 PNG)를 생성한다.

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: CollectionEntry<'blog'> };
  const { title, category, pubDate } = post.data;

  const png = await renderOgImage({
    title,
    eyebrow: CATEGORY_LABELS[category] ?? 'Blog',
    eyebrowColor: OG_CATEGORY_COLORS[category],
    footnote: pubDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
  });

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
