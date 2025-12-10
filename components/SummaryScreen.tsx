'use client';

import { useState, useEffect, useRef } from 'react';
import { Session, Questionnaire, FormattedAnswer } from '@/types';

interface SummaryScreenProps {
  session: Session;
  questionnaire: Questionnaire;
  onEdit: (questionIndex: number) => void;
  onConfirm: () => void;
  onUpdateAnswer?: (index: number, newAnswer: string) => void;
}

// 신뢰도에 따른 배지 색상
const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
  switch (confidence) {
    case 'high':
      return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">高信頼度</span>;
    case 'medium':
      return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">中信頼度</span>;
    case 'low':
      return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">低信頼度</span>;
  }
};

export default function SummaryScreen({
  session,
  questionnaire,
  onEdit,
  onConfirm,
  onUpdateAnswer,
}: SummaryScreenProps) {
  const [countdown, setCountdown] = useState(30);
  const [isPaused, setIsPaused] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [localAnswers, setLocalAnswers] = useState<FormattedAnswer[]>(
    session.formattedAnswers || []
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 포맷팅된 답변이 있으면 사용, 없으면 기존 답변 사용
  const hasFormattedAnswers = localAnswers.length > 0;

  // 카운트다운 타이머
  useEffect(() => {
    // 편집 중이면 카운트다운 정지
    if (isPaused || editingIndex !== null) return;

    // 30秒カウントダウン
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, editingIndex]);

  // 카운트다운이 0이 되면 onConfirm 호출
  useEffect(() => {
    if (countdown === 0) {
      onConfirm();
    }
  }, [countdown, onConfirm]);

  // 편집 시작
  const handleStartEdit = (index: number, currentAnswer: string) => {
    setEditingIndex(index);
    setEditValue(currentAnswer);
    setIsPaused(true);
    // 텍스트 영역에 포커스
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // 편집 저장
  const handleSaveEdit = (index: number) => {
    if (hasFormattedAnswers) {
      const updatedAnswers = [...localAnswers];
      updatedAnswers[index] = {
        ...updatedAnswers[index],
        extractedAnswer: editValue,
        confidence: 'high', // 수동 수정은 높은 신뢰도
      };
      setLocalAnswers(updatedAnswers);

      // 부모 컴포넌트에 변경 알림
      if (onUpdateAnswer) {
        onUpdateAnswer(index, editValue);
      }
    }

    setEditingIndex(null);
    setIsPaused(false);
    // 카운트다운 재시작
    setCountdown(30);
  };

  // 편집 취소
  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
    setIsPaused(false);
    // 카운트다운 재시작
    setCountdown(30);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="gradient-primary text-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-2xl font-bold">回答サマリー</h2>
          <p className="text-sm mt-1 opacity-90">
            {hasFormattedAnswers ? 'AIが会話内容を分析し、各質問への回答を整理しました' : '内容をご確認ください'}
          </p>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {/* カウントダウン */}
          <div className={`mb-6 p-4 rounded-lg border ${
            editingIndex !== null
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <p className={`text-sm text-center ${
              editingIndex !== null ? 'text-yellow-800' : 'text-blue-800'
            }`}>
              {editingIndex !== null ? (
                '編集中... カウントダウンは一時停止しています'
              ) : countdown > 0 ? (
                <>
                  <span className="font-bold text-lg">{countdown}</span>秒後に自動的にメイン画面に戻ります
                </>
              ) : (
                '保存しています...'
              )}
            </p>
          </div>

          {/* AI 요약 */}
          {session.summary && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-sm font-medium text-purple-800 mb-2">📋 問診サマリー</p>
              <p className="text-sm text-purple-700">{session.summary}</p>
            </div>
          )}

          {/* 回答リスト - 포맷팅된 답변 사용 */}
          <div className="space-y-4">
            {hasFormattedAnswers ? (
              // 포맷팅된 답변 표시
              localAnswers.map((answer, index) => (
                <div
                  key={answer.questionId}
                  className={`border rounded-lg p-4 transition-colors ${
                    editingIndex === index
                      ? 'border-[#0066CC] bg-blue-50/50'
                      : 'border-gray-200 hover:border-[#0066CC]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-500">
                          質問 {index + 1}
                        </p>
                        {getConfidenceBadge(answer.confidence)}
                      </div>
                      <p className="font-medium text-gray-800 mb-2">
                        {answer.questionText}
                      </p>

                      {editingIndex === index ? (
                        // 편집 모드
                        <div className="space-y-3">
                          <textarea
                            ref={textareaRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-3 border border-[#0066CC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0066CC] resize-none"
                            rows={3}
                            placeholder="回答を入力してください..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(index)}
                              className="px-4 py-2 bg-[#0066CC] text-white rounded-lg text-sm font-medium hover:bg-[#0055AA] transition-colors"
                            >
                              保存
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 표시 모드
                        <div className={`rounded p-3 ${
                          answer.extractedAnswer === '回答なし'
                            ? 'bg-gray-100'
                            : 'bg-blue-50'
                        }`}>
                          <p className={`${
                            answer.extractedAnswer === '回答なし'
                              ? 'text-gray-500 italic'
                              : 'text-gray-800'
                          }`}>
                            {answer.extractedAnswer}
                          </p>
                        </div>
                      )}
                    </div>
                    {editingIndex !== index && (
                      <button
                        onClick={() => handleStartEdit(index, answer.extractedAnswer)}
                        className="ml-4 px-3 py-1 text-sm text-[#0066CC] hover:bg-blue-50 rounded transition-colors"
                      >
                        修正
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              // 기존 답변 표시 (폴백)
              session.answers.map((answer, index) => (
                <div
                  key={answer.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-[#0066CC] transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-500 mb-1">
                        質問 {index + 1}
                      </p>
                      <p className="font-medium text-gray-800 mb-2">
                        {answer.questionText || answer.questionId}
                      </p>
                      <div className="bg-blue-50 rounded p-3">
                        <p className="text-gray-800">{answer.answer}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onEdit(index)}
                      className="ml-4 px-3 py-1 text-sm text-[#0066CC] hover:bg-blue-50 rounded transition-colors"
                    >
                      修正
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(answer.timestamp).toLocaleString('ja-JP')}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* アクションボタン */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={onConfirm}
              className="flex-1 px-6 py-3 gradient-primary text-white rounded-lg font-medium hover:opacity-90 transition-all"
            >
              確認する
            </button>
          </div>

          {/* 注意事項 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              ※ 回答はLocalStorageに保存され、1時間後に自動的に削除されます
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

