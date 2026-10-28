export const SITE_TITLE = 'SamHyun Dev';
export const SITE_DESCRIPTION = 'Software Engineer | Spring, Cloud, AI Agent';
export const SITE_AUTHOR = 'Sam Hyun Kim';

export const NAV_ITEMS = [
  { label: 'Blog', href: '/blog' },
  { label: 'Projects', href: '/projects' },
  { label: 'About', href: '/about' },
] as const;

export const SOCIAL_LINKS = {
  github: 'https://github.com/samhyun',
  email: 'mailto:rnflal31@gmail.com',
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  spring: 'Spring',
  aws: 'AWS & Infra',
  ai: 'AI 시스템',
  workflow: 'AI 개발 워크플로',
  testing: 'Testing',
  devops: 'DevOps',
  analysis: 'Data Analysis',
  etc: '기타',
};

// 카테고리 점 색 — global.css 팔레트 변수
export const CATEGORY_COLORS: Record<string, string> = {
  spring: 'var(--mint)',
  aws: 'var(--peach)',
  ai: 'var(--lilac)',
  workflow: 'var(--butter)',
  testing: 'var(--mint)',
  devops: 'var(--peach)',
  analysis: 'var(--lilac)',
  etc: 'var(--rule)',
};
