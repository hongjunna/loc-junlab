import { useEffect } from 'react';

const DEFAULT_TITLE = '실시간 위치 조회';

/**
 * 페이지 제목과 검색 노출 여부 설정.
 * 공유 링크/관리 화면은 검색엔진에 노출되지 않도록 noindex 처리한다.
 */
export const useDocumentMeta = (title?: string, { noindex = false } = {}) => {
  useEffect(() => {
    document.title = title || DEFAULT_TITLE;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.name = 'robots';
        document.head.appendChild(robots);
      }
      robots.content = 'noindex, nofollow';
    }
    return () => {
      document.title = DEFAULT_TITLE;
      if (noindex) robots?.remove();
    };
  }, [title, noindex]);
};
