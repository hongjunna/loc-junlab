import { useCallback, useEffect, useRef } from 'react';
import bellSound from '../assets/bell.mp3';

/**
 * 한국어 TTS + 안내 차임.
 * 모바일 정책상 첫 재생은 사용자 제스처(클릭) 안에서 호출해야 이후 자동 재생이 허용된다.
 */
export const useSpeech = () => {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // [Safari 대응] 재생 중 utterance가 GC되지 않도록 참조 유지
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang === 'ko-KR' || v.lang === 'ko_KR') ||
        voices.find((v) => v.lang.startsWith('ko')) ||
        null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick);
  }, []);

  const speak = useCallback((text: string, chime = false) => {
    if (chime) {
      if (!audioRef.current) audioRef.current = new Audio(bellSound);
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => undefined);
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = () => {
      utteranceRef.current = null;
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  return speak;
};
