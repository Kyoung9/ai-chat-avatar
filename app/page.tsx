'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ChatInterface from '@/components/ChatInterface';
import SummaryScreen from '@/components/SummaryScreen';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { analyzeUserAnswer, generateAIResponse, generateSummary, speakText, stopSpeaking } from '@/lib/openai';
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
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);

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
    silenceTimeout: 3000,
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
    }
  }, [isTTSSpeaking, sttStatus, stopSTT]);

  function handleVoiceResult(transcript: string) {
    if (transcript.trim()) {
      handleSendMessage(transcript);
    }
  }

  // 問診完了時の処理
  async function handleCompleteQuestionnaire() {
    const sessionToComplete = currentSession;
    if (!sessionToComplete || !currentQuestionnaire) return;

    setIsGeneratingSummary(true);

    try {
      // 요약 AI를 호출하여 전체 대화에서 각 질문에 맞는 답변 추출
      const summaryResult = await generateSummary(
        currentQuestionnaire.questions,
        messages.map(m => ({ role: m.role, content: m.content })),
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

  async function handleSendMessage(content: string) {
    if (!currentQuestionnaire) return;

    // TTS停止
    stopSpeaking();
    setIsTTSSpeaking(false);

    // AI応答待機状態を設定
    setIsWaitingForAI(true);

    // ユーザーメッセージを追加
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // メッセージを更新し、更新後のメッセージ配列を取得
    // setMessagesは非同期なので、直接配列を作成
    const updatedMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(updatedMessages);

    // セッションに答えを保存（現在の質問に対して）
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
        answeredQuestionIds: currentSession.answeredQuestionIds || [],
      };
      setCurrentSession(updatedSession);
      saveSession(updatedSession);
    }

    // AI応答を生成
    const totalQuestions = currentQuestionnaire.questions.length;
    const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;


    try {
      // 【1段階AI】ユーザーの回答を分析
      const analysisResult = await analyzeUserAnswer(
        content,
        currentQuestionnaire.questions,
        updatedSession?.answeredQuestionIds || [],
        apiKey
      );

      console.log('【1段階AI】分析結果:', analysisResult);

      // 分析結果をセッションに反映
      if (analysisResult.answeredQuestions.length > 0 && updatedSession) {
        const newAnsweredIds = [...(updatedSession.answeredQuestionIds || [])];

        analysisResult.answeredQuestions.forEach(qId => {
          if (!newAnsweredIds.includes(qId)) {
            newAnsweredIds.push(qId);

            // 現在の質問以外の質問に対する答えも保存
            if (qId !== currentQuestion.id) {
              const question = currentQuestionnaire.questions.find(q => q.id === qId);
              if (question) {
                updatedSession.answers.push({
                  id: `${Date.now()}-${qId}`,
                  questionId: qId,
                  questionText: question.text,
                  answer: content,
                  timestamp: Date.now(),
                });
              }
            }
          }
        });

        updatedSession.answeredQuestionIds = newAnsweredIds;
        setCurrentSession(updatedSession);
        saveSession(updatedSession);

        console.log('回答済み質問ID:', newAnsweredIds);
      }

      // 【2段階AI】対話を生成
      const conversationHistory = updatedMessages.map(m => ({ role: m.role, content: m.content }));
      const aiResponse = await generateAIResponse(
        currentQuestion,
        content,
        conversationHistory,
        apiKey,
        isLastQuestion
      );

      console.log('【2段階AI】応答:', aiResponse);

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
        setIsWaitingForAI(false);
      }

      // TTS再生完了後の処理
      // 次の質問に進む判定
      if (!aiResponse.needMoreInfo) {
        // 追加情報が不要な場合、次の質問へ
        const answeredIds = updatedSession?.answeredQuestionIds || [];

        // 次の未回答質問を探す
        let nextIndex = currentQuestionIndex + 1;
        while (nextIndex < totalQuestions &&
               answeredIds.includes(currentQuestionnaire.questions[nextIndex].id)) {
          console.log(`質問 ${currentQuestionnaire.questions[nextIndex].id} は既に回答済み、スキップ`);
          nextIndex++;
        }

        // すべての質問に回答済みかチェック
        const allQuestionsAnswered = nextIndex >= totalQuestions;

        if (allQuestionsAnswered) {
          // すべての質問に回答済み → 要約生成
          console.log('すべての質問に回答済み → 要約生成開始');
          handleCompleteQuestionnaire();
        } else {
          // 次の質問へ移動
          setTimeout(() => {
            setCurrentQuestionIndex(nextIndex);
          }, 500);
        }
      }

      // 마지막 질문이고 isComplete가 true면 즉시 요약 생성
      if (isLastQuestion && aiResponse.isComplete) {
        setTimeout(() => {
          handleCompleteQuestionnaire();
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
      setIsWaitingForAI(false);
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
      answeredQuestionIds: [], // 初期化
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
                isWaitingForAI={isWaitingForAI}
                onSendMessage={handleSendMessage}
                onModeChange={setInputMode}
                onStartVoice={startSTT}
                onStopVoice={stopSTT}
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
