import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * index.html 의 %SITE_URL% 치환 + robots.txt, sitemap.xml 생성.
 * 공유 미리보기 이미지 등은 절대 주소가 필요하므로 빌드 시 SITE_URL 로 채운다.
 */
const seo = (siteUrl: string): Plugin => ({
  name: 'seo',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: [
        'User-agent: *',
        // 관리 화면은 크롤링 제외. 공유 링크(/p/)는 미리보기 봇이 읽을 수 있게 열어두고
        // 페이지에 noindex 를 달아 검색 결과에서만 제외한다
        'Disallow: /config',
        'Disallow: /api/',
        '',
        `Sitemap: ${siteUrl}/sitemap.xml`,
        '',
      ].join('\n'),
    });
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`,
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.SITE_URL || 'https://location.sideplay.dev').replace(/\/$/, '');
  return {
    plugins: [react(), seo(siteUrl)],
    server: {
      // 개발 중 /api 요청은 로컬 백엔드로 프록시
      proxy: {
        '/api': env.VITE_PROXY_TARGET || 'http://localhost:5678',
      },
    },
  };
});
