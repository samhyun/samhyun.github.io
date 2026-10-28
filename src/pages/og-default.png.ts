import type { APIRoute } from 'astro';
import { SITE_AUTHOR } from '../consts';
import { renderOgImage } from '../utils/og';

// 글이 아닌 페이지(홈·목록·소개)의 기본 OG 이미지
export const GET: APIRoute = async () => {
  const png = await renderOgImage({
    title: SITE_AUTHOR,
    eyebrow: 'Software Engineer',
    subtitle: 'Spring 백엔드와 클라우드 인프라, AI 에이전트 프로젝트에서 겪은 고민과 시행착오를 기록합니다.',
  });

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
