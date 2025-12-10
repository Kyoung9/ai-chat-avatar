'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage, InputMode, STTStatus } from '@/types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  inputMode: InputMode;
  sttStatus: STTStatus;
  isTTSSpeaking: boolean;
  onSendMessage: (message: string) => void;
  onModeChange: (mode: InputMode) => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
}

export default function ChatInterface({
  messages,
  inputMode,
  sttStatus,
  isTTSSpeaking,
  onSendMessage,
  onModeChange,
  onStartVoice,
  onStopVoice,
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // メッセージが追加されたら自動スクロール
  useEffect(() => {
    if (messages.length === 0) return;
    
    // DOM更新後にスクロールを実行
    const scrollToBottom = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      
      // scrollTopを直接設定（最も確実な方法）
      const maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTop = maxScroll > 0 ? maxScroll : container.scrollHeight;
    };
    
    // 複数のタイミングで実行して確実にスクロール
    // 1. requestAnimationFrameでDOM更新を待つ
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    });
    
    // 2. 少し遅延させてもう一度実行（画像やレイアウト変更に対応）
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 150);
    
    return () => clearTimeout(timeoutId);
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim() && !isComposing) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME変換中のEnterは送信しない
    if (e.key === 'Enter') {
      // isComposingフラグまたはkeyCodeで判定
      // keyCode 229はIME変換中を示す
      if (isComposing || e.nativeEvent.isComposing || (e as any).keyCode === 229) {
        // IME変換中は何もしない
        return;
      }

      if (e.shiftKey) {
        // Shift+Enterは改行
        return;
      }

      e.preventDefault();
      handleSend();
    }
  };

  // STTステータスバッジ
  const getSTTStatusBadge = () => {
    switch (sttStatus) {
      case 'listening':
        return (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg animate-pulse-slow">
            <span className="text-lg">🎙</span>
            <span className="text-sm font-medium">音声認識中…</span>
          </div>
        );
      case 'silenceDetected':
        return (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg">
            <span className="text-sm font-medium">…入力終了を検出しています（3秒）</span>
          </div>
        );
      case 'processing':
        return (
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg">
            <span className="text-sm font-medium">処理中…</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white rounded-2xl shadow-yuyama-lg overflow-hidden">
      {/* ヘッダー */}
      <div className="px-6 py-4 gradient-primary text-white">
        <h2 className="text-xl font-bold">問診チャット</h2>
        
        {/* モード切替 */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onModeChange('text')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'text'
                ? 'bg-white text-[#0066CC]'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            テキスト入力モード
          </button>
          <button
            onClick={() => onModeChange('voice')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'voice'
                ? 'bg-white text-[#0066CC]'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            音声対話モード（推奨）
          </button>
        </div>
      </div>

      {/* ステータスバッジ */}
      {(sttStatus !== 'idle' || isTTSSpeaking) && (
        <div className="px-6 py-3 bg-gray-50 border-b">
          {isTTSSpeaking ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg">
              <span className="text-lg">🔇</span>
              <span className="text-sm font-medium">アバター発話中です</span>
            </div>
          ) : (
            getSTTStatusBadge()
          )}
        </div>
      )}

      {/* メッセージリスト */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 min-h-0"
        style={{ maxHeight: '100%' }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
          >
            <div
              className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                message.role === 'user'
                  ? 'bg-[#0066CC] text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <span className="text-xs opacity-70 mt-1 block">
                {new Date(message.timestamp).toLocaleTimeString('ja-JP')}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <div className="px-6 py-4 bg-gray-50 border-t">
        {inputMode === 'text' ? (
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => {
                // CompositionEndイベント後に状態を更新
                setIsComposing(false);
              }}
              placeholder="メッセージを入力してください..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#0066CC] focus:border-transparent"
              rows={2}
              disabled={isTTSSpeaking}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isComposing || isTTSSpeaking}
              className="px-6 py-3 gradient-primary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              送信
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">
              マイクボタンを押して話してください
            </p>
            <button
              onClick={sttStatus === 'idle' ? onStartVoice : onStopVoice}
              disabled={isTTSSpeaking}
              className={`px-8 py-4 rounded-full font-medium transition-all ${
                sttStatus === 'listening'
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'gradient-primary text-white hover:opacity-90'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {sttStatus === 'listening' ? '🎙 停止' : '🎙 音声入力開始'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
