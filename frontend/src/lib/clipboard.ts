export const copyText = async (text: string) => {
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
