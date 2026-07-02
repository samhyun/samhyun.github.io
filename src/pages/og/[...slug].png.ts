import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';

// 빌드 타임에 글별 OG 이미지(1200x630 PNG)를 생성한다.
// 디자인은 public/og-default.png(scripts/og-default.html)와 같은 언어를 쓴다.

const categoryLabels: Record<string, string> = {
  spring: 'Spring',
  aws: 'AWS & Infra',
  ai: 'AI & Chatbot',
  testing: 'Testing',
  devops: 'DevOps',
  etc: 'Blog',
};

const fontDir = path.resolve('node_modules/pretendard/dist/public/static');
const [regular, semiBold, extraBold] = await Promise.all([
  fs.readFile(path.join(fontDir, 'Pretendard-Regular.otf')),
  fs.readFile(path.join(fontDir, 'Pretendard-SemiBold.otf')),
  fs.readFile(path.join(fontDir, 'Pretendard-ExtraBold.otf')),
]);

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

function titleFontSize(title: string): number {
  if (title.length <= 24) return 72;
  if (title.length <= 40) return 62;
  if (title.length <= 55) return 54;
  return 48;
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: CollectionEntry<'blog'> };
  const title = post.data.title;
  const category = categoryLabels[post.data.category] ?? 'Blog';
  const date = post.data.pubDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const element = {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0b1120',
        fontFamily: 'Pretendard',
        position: 'relative',
      },
      children: [
        // 상단 그라데이션 바
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '10px',
              backgroundImage: 'linear-gradient(90deg, #2563eb, #7c3aed, #2563eb)',
            },
          },
        },
        // 장식 블롭 (좌상단 블루)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '-180px',
              left: '-120px',
              width: '560px',
              height: '560px',
              borderRadius: '50%',
              backgroundImage:
                'radial-gradient(circle, rgba(37,99,235,0.32), rgba(37,99,235,0))',
            },
          },
        },
        // 장식 블롭 (우하단 바이올렛)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '-220px',
              right: '-100px',
              width: '620px',
              height: '620px',
              borderRadius: '50%',
              backgroundImage:
                'radial-gradient(circle, rgba(124,58,237,0.28), rgba(124,58,237,0))',
            },
          },
        },
        // 본문 영역
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flexGrow: 1,
              padding: '0 88px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 600,
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    color: '#60a5fa',
                    marginBottom: '28px',
                  },
                  children: category,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: `${titleFontSize(title)}px`,
                    fontWeight: 800,
                    color: '#f1f5f9',
                    lineHeight: 1.28,
                    letterSpacing: '-0.02em',
                    wordBreak: 'keep-all',
                    maxWidth: '1010px',
                  },
                  children: title,
                },
              },
            ],
          },
        },
        // 푸터
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 88px 56px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '30px',
                    fontWeight: 800,
                    backgroundImage: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                    backgroundClip: 'text',
                    color: 'transparent',
                  },
                  children: 'SamHyun Dev',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 400,
                    color: '#64748b',
                  },
                  children: date,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Pretendard', data: regular, weight: 400, style: 'normal' },
      { name: 'Pretendard', data: semiBold, weight: 600, style: 'normal' },
      { name: 'Pretendard', data: extraBold, weight: 800, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    .render()
    .asPng();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
