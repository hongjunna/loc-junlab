import { Button, Form, InputGroup, Modal } from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { useFeedback } from './feedback/context';
import { shareUrlOf } from '../lib/ui';
import type { DriveLog } from '../types';

const copyText = async (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // 비보안 컨텍스트(HTTP) 대비
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!ok) throw new Error('copy failed');
};

const ShareModal = ({
  drive,
  show,
  onHide,
}: {
  drive: DriveLog;
  show: boolean;
  onHide: () => void;
}) => {
  const { toast } = useFeedback();
  const url = shareUrlOf(drive);
  const first = drive.checkpoints[0]?.pointName || '?';
  const last = drive.checkpoints[drive.checkpoints.length - 1]?.pointName || '?';
  const text = `🚌 ${drive.routeName}\n[출발] ${first} → [도착] ${last}\n실시간 위치를 확인해 보세요.${
    drive.shareCode ? `\n(조회 코드: ${drive.shareCode})` : ''
  }`;
  const canShare = typeof navigator.share === 'function';

  const handleShare = async () => {
    try {
      await navigator.share({ title: drive.routeName, text, url });
    } catch (err) {
      if ((err as Error).name !== 'AbortError')
        toast('공유하지 못했습니다.', { variant: 'danger' });
    }
  };

  const handleCopy = async () => {
    try {
      await copyText(`${text}\n${url}`);
      toast('📋 공유 문구가 복사되었습니다.', { variant: 'success' });
    } catch {
      toast('복사하지 못했습니다. 링크를 길게 눌러 직접 복사해주세요.', { variant: 'warning' });
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-5">실시간 위치 공유</Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        <div className="bg-white d-inline-block p-2 rounded border">
          <QRCodeSVG value={url} size={180} />
        </div>
        {drive.shareCode && (
          <div className="mt-3">
            <div className="small text-muted">조회 코드</div>
            <div className="share-code">{drive.shareCode}</div>
          </div>
        )}
        <InputGroup size="sm" className="mt-3">
          <Form.Control readOnly value={url} onFocus={(e) => e.target.select()} />
        </InputGroup>
        <div className="small text-muted mt-2">
          운행 종료 후 일정 시간이 지나면 링크가 만료됩니다.
        </div>
      </Modal.Body>
      <Modal.Footer className="d-flex">
        {canShare && (
          <Button className="flex-fill" onClick={handleShare}>
            공유하기
          </Button>
        )}
        <Button
          variant={canShare ? 'outline-secondary' : 'primary'}
          className="flex-fill"
          onClick={handleCopy}
        >
          문구 복사
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ShareModal;
