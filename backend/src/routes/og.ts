import { Router, type Request } from 'express';
import { config } from '../config';
import { DriveLog } from '../models/drive_log';
import { SHARE_CODE_RE } from '../services/drive';

/**
 * 공유 링크 미리보기용 HTML.
 * 카카오톡 등 링크 미리보기 봇은 JS를 실행하지 않으므로,
 * 프론트 nginx가 봇 요청(/p/:code)만 이곳으로 넘겨 노선 이름이 들어간 OG 태그를 내려준다.
 */
const router = Router();

const SITE_NAME = '실시간 위치 조회';
const DEFAULT_DESC = '차량이 지금 어디쯤인지, 내 위치엔 언제 오는지 확인하세요.';

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

const baseUrl = (req: Request) =>
  config.publicUrl || `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;

const page = (url: string, title: string, description: string, image: string) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<meta name="robots" content="noindex" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:url" content="${escape(url)}" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:image" content="${escape(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escape(title)}" />
<meta name="twitter:description" content="${escape(description)}" />
<meta name="twitter:image" content="${escape(image)}" />
</head>
<body><a href="${escape(url)}">${escape(title)}</a></body>
</html>`;

router.get('/og/p/:code', async (req, res) => {
  const base = baseUrl(req);
  const code = req.params.code.toUpperCase();
  const url = `${base}/p/${encodeURIComponent(code)}`;
  const image = `${base}/og-image.png`;

  const drive = SHARE_CODE_RE.test(code)
    ? await DriveLog.findOne({ shareCode: code }).select('routeName status checkpoints').lean()
    : null;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  if (!drive) {
    res.send(page(url, SITE_NAME, DEFAULT_DESC, image));
    return;
  }
  const first = drive.checkpoints[0]?.pointName;
  const last = drive.checkpoints[drive.checkpoints.length - 1]?.pointName;
  const title = `🚗 ${drive.routeName} 실시간 위치`;
  const route = first && last ? `${first} → ${last}` : '';
  const description =
    drive.status === 'running'
      ? `${route}${route ? ' · ' : ''}지금 운행 중입니다. 눌러서 차량 위치와 도착 예정 시각을 확인하세요.`
      : `${route}${route ? ' · ' : ''}운행이 종료되었습니다.`;
  res.send(page(url, title, description, image));
});

export default router;
