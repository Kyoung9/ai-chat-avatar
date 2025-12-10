'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ChatInterface from '@/components/ChatInterface';
import SummaryScreen from '@/components/SummaryScreen';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { generateAIResponse, generateSummary, speakText, stopSpeaking } from '@/lib/openai';
import { saveSession, cleanExpiredSessions } from '@/lib/storage';
import {
  ChatMessage,
  InputMode,
  Session,
  Questionnaire,
  getAllQuestionnaires,
  EmotionType
} from '@/types';

// 3Dアバターは動的インポート（SSR無効化）
const Avatar3D = dynamic(() => import('@/components/Avatar3D'), { ssr: false });

export default function Home() {
  const [isStarted, setIsStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('neutral');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [availableQuestionnaires, setAvailableQuestionnaires] = useState<Questionnaire[]>([]);
  const [currentQuestionnaire, setCurrentQuestionnaire] = useState<Questionnaire | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [shouldAutoResume, setShouldAutoResume] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // OpenAI API Key
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';

  // 文診表を読み込む
  useEffect(() => {
    const questionnaires = getAllQuestionnaires();
    setAvailableQuestionnaires(questionnaires);
    if (questionnaires.length > 0) {
      setCurrentQuestionnaire(questionnaires[0]);
    }
  }, []);

  // 音声認識フック
  const { status: sttStatus, transcript, start: startSTT, stop: stopSTT } = useSpeechRecognition({
    onResult: handleVoiceResult,
    language: 'ja-JP',
    silenceTimeout: 1000,
  });

  // 初期化：期限切れセッションを削除
  useEffect(() => {
    cleanExpiredSessions();
  }, []);

  // TTS再生中はSTTを停止
  useEffect(() => {
    if (isTTSSpeaking) {
      // TTS開始時
      if (sttStatus !== 'idle') {
        console.log('TTS開始、STTを停止');
        stopSTT();
      }
      // TTS開始時に自動再開フラグを立てる
      if (inputMode === 'voice') {
        console.log('自動再開フラグをON');
        setShouldAutoResume(true);
      }
    }
  }, [isTTSSpeaking, sttStatus, stopSTT, inputMode]);

  // TTS終了後に自動再開（1回だけ）
  useEffect(() => {
    if (!isTTSSpeaking && shouldAutoResume && inputMode === 'voice' && isStarted) {
      console.log('TTS終了、音声認識を自動再開します');
      setShouldAutoResume(false); // フラグをクリア
      const timer = setTimeout(() => {
        console.log('音声認識を再開');
        startSTT();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isTTSSpeaking, shouldAutoResume, inputMode, isStarted, startSTT]);

  function handleVoiceResult(transcript: string) {
    if (transcript.trim()) {
      handleSendMessage(transcript);
    }
  }

  async function handleSendMessage(content: string) {
    if (!currentQuestionnaire) return;

    // TTS停止
    stopSpeaking();
    setIsTTSSpeaking(false);

    // ユーザーメッセージを追加
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    
    // メッセージを更新し、更新後のメッセージ配列を取得
    let updatedMessages: ChatMessage[] = [];
    setMessages(prev => {
      updatedMessages = [...prev, userMessage];
      return updatedMessages;
    });

    // セッションに答えを保存
    const currentQuestion = currentQuestionnaire.questions[currentQuestionIndex];
    let updatedSession: Session | null = null;

    if (currentSession) {
      updatedSession = {
        ...currentSession,
        answers: [
          ...currentSession.answers,
          {
            id: Date.now().toString(),
            questionId: currentQuestion.id,
            questionText: currentQuestion.text, // 質問テキストも保存
            answer: content,
            timestamp: Date.now(),
          },
        ],
        currentQuestionIndex: currentQuestionIndex,
      };
      setCurrentSession(updatedSession);
      saveSession(updatedSession);
    }

    // AI応答を生成
    const totalQuestions = currentQuestionnaire.questions.length;
    const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;
    const nextQuestion = !isLastQuestion
      ? currentQuestionnaire.questions[currentQuestionIndex + 1]
      : null;

    try {
      const aiResponse = await generateAIResponse(
        currentQuestion,
        content,
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        apiKey,
        currentQuestionIndex,
        totalQuestions,
        nextQuestion
      );

      // AIメッセージを追加
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse.reply,
        timestamp: Date.now(),
        emotion: aiResponse.emotion,
      };
      setMessages(prev => [...prev, aiMessage]);
      setCurrentEmotion(aiResponse.emotion);

      // TTS再生
      try {
        await speakText(aiResponse.reply, apiKey, () => {
          // 音声再生が実際に開始されたときに呼ばれる
          setIsTTSSpeaking(true);
        });
      } catch (error) {
        console.error('TTS error:', error);
      } finally {
        setIsTTSSpeaking(false);
      }

      // 次の質問に進む、または問診完了
      if (aiResponse.nextQuestionId) {
        // 다음 질문으로 이동
        setTimeout(() => {
          if (!isLastQuestion) {
            setCurrentQuestionIndex(prev => prev + 1);
          }
        }, 500);
      }

      // 마지막 질문이고 isComplete가 true면 즉시 요약 생성
      if (isLastQuestion && aiResponse.isComplete) {
        // TTS 완료 후 바로 요약 생성
        setTimeout(async () => {
          const sessionToComplete = updatedSession || currentSession;
          if (sessionToComplete) {
            setIsGeneratingSummary(true);

            try {
              // 요약 AI를 호출하여 전체 대화에서 각 질문에 맞는 답변 추출
              const allMessages = [...updatedMessages, aiMessage];
              const summaryResult = await generateSummary(
                currentQuestionnaire.questions,
                allMessages.map(m => ({ role: m.role, content: m.content })),
                apiKey
              );

              const completedSession = {
                ...sessionToComplete,
                isCompleted: true,
                formattedAnswers: summaryResult.formattedAnswers,
                summary: summaryResult.summary,
              };
              setCurrentSession(completedSession);
              saveSession(completedSession);
            } catch (error) {
              console.error('要約生成エラー:', error);
              // 에러 시에도 세션 완료 처리
              const completedSession = {
                ...sessionToComplete,
                isCompleted: true,
              };
              setCurrentSession(completedSession);
              saveSession(completedSession);
            } finally {
              setIsGeneratingSummary(false);
              setShowSummary(true);
            }
          }
        }, 500);
      }
    } catch (error) {
      console.error('AI応答エラー:', error);
      // エラーメッセージを追加
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: '申し訳ございません。エラーが発生しました。もう一度お願いできますか？',
        timestamp: Date.now(),
        emotion: 'neutral',
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }

  function handleEditAnswer(questionIndex: number) {
    // 이 함수는 더 이상 사용하지 않음 (인라인 편집으로 대체)
    // 하위 호환성을 위해 유지
    console.log('handleEditAnswer called for index:', questionIndex);
  }

  function handleUpdateAnswer(index: number, newAnswer: string) {
    // 인라인 편집에서 답변 수정 시 호출
    if (currentSession && currentSession.formattedAnswers) {
      const updatedFormattedAnswers = [...currentSession.formattedAnswers];
      updatedFormattedAnswers[index] = {
        ...updatedFormattedAnswers[index],
        extractedAnswer: newAnswer,
        confidence: 'high', // 수동 수정은 높은 신뢰도
      };

      const updatedSession = {
        ...currentSession,
        formattedAnswers: updatedFormattedAnswers,
      };

      setCurrentSession(updatedSession);
      saveSession(updatedSession);
    }
  }

  function handleConfirmSummary() {
    // 最終保存して初期画面に戻る
    if (currentSession) {
      saveSession(currentSession);
    }

    // 状態をリセット
    setShowSummary(false);
    setIsStarted(false);
    setMessages([]);
    setCurrentQuestionIndex(0);
    setCurrentSession(null);
  }

  function handleStart() {
    if (!currentQuestionnaire) return;

    setIsStarted(true);

    // セッション作成
    const newSession: Session = {
      sessionId: Date.now().toString(),
      questionnaireId: currentQuestionnaire.id,
      createdAt: Date.now(),
      answers: [],
      currentQuestionIndex: 0,
      isCompleted: false,
    };
    setCurrentSession(newSession);
    saveSession(newSession);

    // 初期メッセージ
    const welcomeMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: 'こんにちは。本日の問診を担当いたします。よろしくお願いします。',
      timestamp: Date.now(),
      emotion: 'gentle',
    };
    setMessages([welcomeMessage]);
    setCurrentEmotion('gentle');

    // TTS再生
    speakText(welcomeMessage.content, apiKey, () => {
      // 音声再生が実際に開始されたときに呼ばれる
      setIsTTSSpeaking(true);
    }).finally(() => {
      setIsTTSSpeaking(false);
    });
  }

  return (
    <div className="min-h-screen">
      {/* 要約生成中ローディング */}
      {isGeneratingSummary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-800">回答を分析中...</p>
            <p className="text-sm text-gray-500 mt-2">AIが会話内容を整理しています</p>
          </div>
        </div>
      )}

      {/* 要約画面 */}
      {showSummary && currentSession && currentQuestionnaire && (
        <SummaryScreen
          session={currentSession}
          questionnaire={currentQuestionnaire}
          onEdit={handleEditAnswer}
          onConfirm={handleConfirmSummary}
          onUpdateAnswer={handleUpdateAnswer}
        />
      )}

      {/* ヘッダー */}
      <header className="bg-white shadow-yuyama">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#0066CC]">AI問診アシスタント</h1>
          <Link
            href="/admin"
            className="px-4 py-2 text-sm font-medium text-[#0066CC] hover:bg-blue-50 rounded-lg transition-colors"
          >
            管理コンソール
          </Link>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {!isStarted ? (
          // スタート画面
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
            <div className="mb-8">
              <h2 className="text-4xl font-bold text-gray-800 mb-4">
                ようこそ
              </h2>
              <p className="text-lg text-gray-600">
                音声対話型の問診システムです
              </p>
            </div>
            <button
              onClick={handleStart}
              className="px-8 py-4 gradient-primary text-white text-lg font-bold rounded-full shadow-yuyama-lg hover:opacity-90 transition-all transform hover:scale-105"
            >
              問診を開始する
            </button>
          </div>
        ) : (
          // 問診画面（2カラムレイアウト）
          <div className="grid grid-cols-1 lg:grid-cols-2 grid-rows-1 gap-6 h-[calc(100vh-200px)] min-h-0">
            {/* 左：チャットインターフェース */}
            <div className="h-full min-h-0">
              <ChatInterface
                messages={messages}
                inputMode={inputMode}
                sttStatus={sttStatus}
                isTTSSpeaking={isTTSSpeaking}
                onSendMessage={handleSendMessage}
                onModeChange={setInputMode}
                onStartVoice={startSTT}
                onStopVoice={() => {
                  stopSTT();
                  setShouldAutoResume(false); // 手動停止時は自動再開しない
                }}
              />
            </div>

            {/* 右：3Dアバター */}
            <div className="h-full min-h-0 relative">
              <Avatar3D emotion={currentEmotion} isSpeaking={isTTSSpeaking} />

              {/* 進行状況 */}
              {currentQuestionnaire && (
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                  <p className="text-sm font-medium text-gray-700">
                    {currentQuestionIndex + 1} / {currentQuestionnaire.questions.length} 問目
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
