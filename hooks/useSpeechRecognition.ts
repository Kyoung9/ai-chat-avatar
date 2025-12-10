'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { STTStatus } from '@/types';

interface UseSpeechRecognitionProps {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  language?: string;
  silenceTimeout?: number;
}

export function useSpeechRecognition({
  onResult,
  onError,
  language = 'ja-JP',
  silenceTimeout = 1000,
}: UseSpeechRecognitionProps) {
  const [status, setStatus] = useState<STTStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef('');
  const isActiveRef = useRef(false); // 認識が有効かどうかを追跡
  const accumulatedFinalRef = useRef(''); // 確定テキストを累積

  // コールバックと設定値をrefで管理し、useEffect 再実行防止
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const silenceTimeoutRef = useRef(silenceTimeout);

  // ref 값 업데이트
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
    silenceTimeoutRef.current = silenceTimeout;
  }, [onResult, onError, silenceTimeout]);

  useEffect(() => {
    // Web Speech API対応チェック
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          console.log('音声認識開始');
          setStatus('listening');
          isActiveRef.current = true;
          accumulatedFinalRef.current = ''; // 初期化
        };

        recognition.onresult = (event: any) => {
          if (!isActiveRef.current) return;

          let interimTranscript = '';

          // すべての結果を処理
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;

            if (result.isFinal) {
              // 確定結果累積
              if (i >= event.resultIndex) {
                accumulatedFinalRef.current += text;
              }
            } else {
              // 中間結果
              interimTranscript += text;
            }
          }

          const currentTranscript = accumulatedFinalRef.current + interimTranscript;
          console.log('認識結果:', currentTranscript);
          setTranscript(currentTranscript);
          lastTranscriptRef.current = currentTranscript;

          // 無音タイマーをリセット
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // 新しい無音タイマーを設定
          setStatus('listening');
          silenceTimerRef.current = setTimeout(() => {
            if (!isActiveRef.current) return;

            setStatus('silenceDetected');
            console.log('無音検出、送信準備中...');

            // さらに少し待ってから送信
            setTimeout(() => {
              if (lastTranscriptRef.current.trim() && isActiveRef.current) {
                console.log('送信:', lastTranscriptRef.current.trim());
                onResultRef.current(lastTranscriptRef.current.trim());
                setTranscript('');
                lastTranscriptRef.current = '';
                accumulatedFinalRef.current = ''; // 初期化
                isActiveRef.current = false;
                setStatus('idle');
                try {
                  recognition.stop();
                } catch (e) {
                  console.log('Recognition already stopped');
                }
              }
            }, 500);
          }, silenceTimeoutRef.current);
        };

        recognition.onerror = (event: any) => {
          // 'no-speech'や'aborted'エラーは無視（ログも出さない）
          if (event.error === 'no-speech' || event.error === 'aborted') {
            return;
          }

          console.error('音声認識エラー:', event.error);
          if (onErrorRef.current) {
            onErrorRef.current(event.error);
          }
          isActiveRef.current = false;
          setStatus('idle');
        };

        recognition.onend = () => {
          const wasActive = isActiveRef.current;
          console.log('音声認識終了、isActive:', wasActive);

          // 常にisActiveをfalseに設定（次回のstart()を可能にする）
          isActiveRef.current = false;
          setStatus('idle');
        };

        recognitionRef.current = recognition;
      } else {
        console.error('Web Speech API is not supported in this browser');
        if (onErrorRef.current) {
          onErrorRef.current('Web Speech APIがサポートされていません');
        }
      }
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]); // silenceTimeout, onResult, onError는 ref로 관리하므로 의존성에서 제외

  const start = useCallback(() => {
    console.log('start()呼び出し - recognitionRef:', !!recognitionRef.current, 'isActive:', isActiveRef.current);
    if (recognitionRef.current && !isActiveRef.current) {
      try {
        console.log('音声認識を開始します');
        setTranscript('');
        lastTranscriptRef.current = '';
        accumulatedFinalRef.current = ''; // 누적 텍스트 초기화
        isActiveRef.current = true;
        recognitionRef.current.start();
        setStatus('listening');
      } catch (e) {
        console.error('Failed to start recognition:', e);
        isActiveRef.current = false;
      }
    } else if (isActiveRef.current) {
      console.warn('認識は既に開始されています - isActive:', isActiveRef.current);
    } else {
      console.error('recognitionRefが存在しません');
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      console.log('音声認識を停止します');
      isActiveRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Stop failed:', e);
      }
      setStatus('idle');
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    }
  }, []);

  return {
    status,
    transcript,
    start,
    stop,
    isSupported: typeof window !== 'undefined' && 
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  };
}

