import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';

// 링크 미리보기(OG) 이미지 1200x630 — 사이트 라이트 테마와 같은 팔레트·스티커 스타일

const C = {
  paper: '#fbf6ec',
  paper2: '#f4ecdc',
  ink: '#221e33',
  muted: '#5c566c',
  faint: '#8d869a',
  butter: '#ffd45c',
  mint: '#a6dfc6',
  lilac: '#cdb9f3',
  peach: '#ffb89c',
  plum: '#6a3fc4',
};

// global.css 팔레트 변수 대신 쓰는 카테고리 점 색
export const OG_CATEGORY_COLORS: Record<string, string> = {
  spring: C.mint,
  aws: C.peach,
  ai: C.lilac,
  workflow: C.butter,
  testing: C.mint,
  devops: C.peach,
  analysis: C.lilac,
  etc: '#e8dcc6',
};

const pretendardDir = path.resolve('node_modules/pretendard/dist/public/static');
const [regular, semiBold, display] = await Promise.all([
  fs.readFile(path.join(pretendardDir, 'Pretendard-Regular.otf')),
  fs.readFile(path.join(pretendardDir, 'Pretendard-SemiBold.otf')),
  fs.readFile(path.resolve('src/assets/fonts/GmarketSansBold.otf')),
]);

// Scene.astro 그림을 라이트 색으로 고정한 버전
const sceneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 380" fill="none">
  <circle cx="440" cy="92" r="60" fill="${C.butter}"/>
  <path d="M40 336 C 90 296, 170 300, 250 320 S 440 350, 520 306 C 552 320, 548 368, 500 370 L 74 370 C 30 370, 18 352, 40 336 Z" fill="${C.mint}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  <g stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9">
    <path d="M196 170 C 260 170, 270 110, 330 110"/><path d="M196 214 C 280 214, 290 214, 360 214"/><path d="M196 258 C 260 258, 280 300, 330 300"/>
  </g>
  <rect x="80" y="154" width="132" height="132" rx="18" fill="${C.ink}"/>
  <rect x="74" y="148" width="132" height="44" rx="14" fill="${C.lilac}" stroke="${C.ink}" stroke-width="3"/>
  <rect x="74" y="192" width="132" height="44" rx="14" fill="${C.peach}" stroke="${C.ink}" stroke-width="3"/>
  <rect x="74" y="236" width="132" height="44" rx="14" fill="#fffaf0" stroke="${C.ink}" stroke-width="3"/>
  <g fill="${C.ink}">
    <circle cx="96" cy="170" r="5"/><rect x="112" y="166" width="54" height="8" rx="4"/>
    <circle cx="96" cy="214" r="5"/><rect x="112" y="210" width="40" height="8" rx="4"/>
    <circle cx="96" cy="258" r="5"/><rect x="112" y="254" width="62" height="8" rx="4"/>
  </g>
  <circle cx="186" cy="170" r="5" fill="${C.mint}" stroke="${C.ink}" stroke-width="2"/>
  <circle cx="356" cy="114" r="26" fill="${C.ink}"/>
  <circle cx="352" cy="110" r="26" fill="${C.mint}" stroke="${C.ink}" stroke-width="3"/>
  <path d="M342 110 l7 7 l13 -14" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="364" y="192" width="76" height="52" rx="16" fill="${C.ink}"/>
  <rect x="360" y="188" width="76" height="52" rx="16" fill="${C.butter}" stroke="${C.ink}" stroke-width="3"/>
  <g fill="${C.ink}"><circle cx="384" cy="214" r="4.5"/><circle cx="398" cy="214" r="4.5"/><circle cx="412" cy="214" r="4.5"/></g>
  <circle cx="356" cy="304" r="22" fill="${C.ink}"/>
  <circle cx="352" cy="300" r="22" fill="${C.lilac}" stroke="${C.ink}" stroke-width="3"/>
  <path d="M344 300 h16 M352 292 v16" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round"/>
  <g fill="${C.plum}">
    <path d="M480 196 l5 13 l13 5 l-13 5 l-5 13 l-5 -13 l-13 -5 l13 -5 z"/>
    <path d="M262 70 l3.5 9 l9 3.5 l-9 3.5 l-3.5 9 l-3.5 -9 l-9 -3.5 l9 -3.5 z"/>
  </g>
</svg>`;

const sceneDataUri = `data:image/svg+xml;base64,${Buffer.from(sceneSvg).toString('base64')}`;

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

function logo(): Node {
  return el('div', { display: 'flex', alignItems: 'center', gap: '16px' }, [
    el('div', { display: 'flex', position: 'relative', width: '58px', height: '58px' }, [
      el('div', { position: 'absolute', left: '5px', top: '5px', width: '54px', height: '54px', borderRadius: '12px', backgroundColor: C.ink }),
      el(
        'div',
        {
          position: 'absolute', left: 0, top: 0, width: '54px', height: '54px', borderRadius: '12px',
          backgroundColor: C.butter, border: `3px solid ${C.ink}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Gmarket Sans', fontSize: '28px', color: C.ink,
        },
        'S',
      ),
    ]),
    el('div', { fontFamily: 'Gmarket Sans', fontSize: '34px', color: C.ink }, 'samhyun'),
  ]);
}

function titleFontSize(title: string): number {
  if (title.length <= 20) return 66;
  if (title.length <= 34) return 58;
  if (title.length <= 48) return 50;
  return 44;
}

interface OgInput {
  title: string;
  /** 제목 위 작은 라벨 */
  eyebrow?: string;
  /** 라벨 앞 색 점 */
  eyebrowColor?: string;
  /** 제목 아래 보조 문장 */
  subtitle?: string;
  /** 하단 오른쪽 날짜 등 */
  footnote?: string;
}

export async function renderOgImage({ title, eyebrow, eyebrowColor, subtitle, footnote }: OgInput): Promise<Buffer> {
  const element = el(
    'div',
    {
      width: '1200px', height: '630px', display: 'flex', position: 'relative',
      backgroundColor: C.paper2, fontFamily: 'Pretendard', padding: '64px 72px',
    },
    [
      // 아래쪽 물결 바탕
      el('img', { position: 'absolute', left: 0, bottom: 0, width: '1200px', height: '140px' }, undefined, {
        src: `data:image/svg+xml;base64,${Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 140" preserveAspectRatio="none"><path fill="${C.paper}" d="M0 60 C 260 120, 540 10, 820 54 S 1100 100, 1200 50 L1200 140 L0 140 Z"/></svg>`,
        ).toString('base64')}`,
        width: 1200,
        height: 140,
      }),
      // 오른쪽 그림
      el('img', { position: 'absolute', right: '40px', top: '128px', width: '440px', height: '298px' }, undefined, {
        src: sceneDataUri,
        width: 440,
        height: 298,
      }),
      // 텍스트 열
      el('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '660px', height: '100%' }, [
        logo(),
        el('div', { display: 'flex', flexDirection: 'column' }, [
          eyebrow
            ? el('div', { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '26px', fontWeight: 600, color: C.muted, marginBottom: '22px' }, [
                eyebrowColor
                  ? el('div', { width: '18px', height: '18px', borderRadius: '9px', backgroundColor: eyebrowColor, border: `2px solid ${C.ink}` })
                  : null,
                el('div', {}, eyebrow),
              ].filter(Boolean))
            : null,
          el(
            'div',
            {
              fontFamily: 'Gmarket Sans', fontSize: `${titleFontSize(title)}px`, color: C.ink,
              lineHeight: 1.3, wordBreak: 'keep-all',
            },
            title,
          ),
          subtitle
            ? el('div', { marginTop: '22px', fontSize: '28px', lineHeight: 1.5, color: C.muted, wordBreak: 'keep-all' }, subtitle)
            : null,
        ].filter(Boolean)),
        el('div', { fontSize: '24px', color: C.faint }, footnote ?? 'samhyun.github.io'),
      ]),
    ],
  );

  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Pretendard', data: regular, weight: 400, style: 'normal' },
      { name: 'Pretendard', data: semiBold, weight: 600, style: 'normal' },
      { name: 'Gmarket Sans', data: display, weight: 700, style: 'normal' },
    ],
  });

  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
