'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllSessions, clearAllSessions } from '@/lib/storage';
import { Session, DEFAULT_QUESTIONNAIRES, Questionnaire } from '@/types';
import QuestionnaireEditor from '@/components/QuestionnaireEditor';

export default function AdminPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'questionnaires'>('sessions');
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<Questionnaire | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [viewingQuestionnaire, setViewingQuestionnaire] = useState<Questionnaire | null>(null);

  useEffect(() => {
    loadSessions();
    loadQuestionnaires();
  }, []);

  function loadSessions() {
    const allSessions = getAllSessions();
    setSessions(allSessions);
  }

  function loadQuestionnaires() {
    // LocalStorageから文診表を読み込む
    const stored = localStorage.getItem('questionnaires');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setQuestionnaires([...DEFAULT_QUESTIONNAIRES, ...parsed]);
      } catch (e) {
        setQuestionnaires(DEFAULT_QUESTIONNAIRES);
      }
    } else {
      setQuestionnaires(DEFAULT_QUESTIONNAIRES);
    }
  }

  function saveQuestionnaires(questionnaires: Questionnaire[]) {
    // デフォルト以外の文診表を保存
    const custom = questionnaires.filter(
      (q) => !DEFAULT_QUESTIONNAIRES.find((dq) => dq.id === q.id)
    );
    localStorage.setItem('questionnaires', JSON.stringify(custom));
  }

  function handleClearAll() {
    if (confirm('すべてのセッションを削除してもよろしいですか？')) {
      clearAllSessions();
      loadSessions();
    }
  }

  function handleAddQuestionnaire() {
    setEditingQuestionnaire(null);
    setShowEditor(true);
  }

  function handleEditQuestionnaire(questionnaire: Questionnaire) {
    setEditingQuestionnaire(questionnaire);
    setShowEditor(true);
  }

  function handleSaveQuestionnaire(questionnaire: Questionnaire) {
    const updated = questionnaires.filter((q) => q.id !== questionnaire.id);
    const newList = [...updated, questionnaire];
    setQuestionnaires(newList);
    saveQuestionnaires(newList);
    setShowEditor(false);
    setEditingQuestionnaire(null);
  }

  function handleDeleteQuestionnaire(id: string) {
    if (confirm('この文診表を削除してもよろしいですか？')) {
      const updated = questionnaires.filter((q) => q.id !== id);
      setQuestionnaires(updated);
      saveQuestionnaires(updated);
    }
  }

  function handleViewQuestionnaire(questionnaire: Questionnaire) {
    setViewingQuestionnaire(questionnaire);
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString('ja-JP');
  }

  function getTimeRemaining(createdAt: number) {
    const expiryTime = createdAt + 60 * 60 * 1000; // 1時間後
    const remaining = expiryTime - Date.now();
    
    if (remaining <= 0) return '期限切れ';
    
    const minutes = Math.floor(remaining / 60000);
    return `残り ${minutes} 分`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* エディタモーダル */}
      {showEditor && (
        <QuestionnaireEditor
          questionnaire={editingQuestionnaire}
          onSave={handleSaveQuestionnaire}
          onCancel={() => {
            setShowEditor(false);
            setEditingQuestionnaire(null);
          }}
        />
      )}

      {/* 詳細表示モーダル */}
      {viewingQuestionnaire && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="gradient-primary text-white px-6 py-4 rounded-t-2xl">
              <h2 className="text-2xl font-bold">{viewingQuestionnaire.title}</h2>
              <p className="text-sm mt-1 opacity-90">{viewingQuestionnaire.description}</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {viewingQuestionnaire.questions.map((question, index) => (
                  <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      質問 {index + 1}
                    </p>
                    <p className="text-gray-800">{question.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setViewingQuestionnaire(null)}
                  className="px-6 py-2 gradient-primary text-white rounded-lg hover:opacity-90"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ヘッダー */}
      <header className="bg-white shadow-yuyama">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#0066CC]">管理コンソール</h1>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-[#0066CC] hover:bg-blue-50 rounded-lg transition-colors"
          >
            ← メインに戻る
          </Link>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* タブ */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'sessions'
                  ? 'border-[#0066CC] text-[#0066CC]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              セッション管理
            </button>
            <button
              onClick={() => setActiveTab('questionnaires')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'questionnaires'
                  ? 'border-[#0066CC] text-[#0066CC]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              文診表管理
            </button>
          </nav>
        </div>

        {/* セッション管理 */}
        {activeTab === 'sessions' && (
          <div className="bg-white rounded-2xl shadow-yuyama p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                保存されたセッション ({sessions.length}件)
              </h2>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                すべて削除
              </button>
            </div>

            {sessions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                保存されたセッションはありません
              </p>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="border border-gray-200 rounded-lg p-4 hover:border-[#0066CC] transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-gray-800">
                          セッションID: {session.sessionId}
                        </p>
                        <p className="text-sm text-gray-500">
                          文診表: {session.questionnaireId}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">
                          {formatDate(session.createdAt)}
                        </p>
                        <p className="text-xs text-orange-600 font-medium">
                          {getTimeRemaining(session.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* AI 요약 표시 */}
                    {session.summary && (
                      <div className="bg-purple-50 rounded p-3 mb-3 border border-purple-200">
                        <p className="text-sm font-medium text-purple-700 mb-1">📋 問診サマリー:</p>
                        <p className="text-sm text-purple-800">{session.summary}</p>
                      </div>
                    )}

                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        回答 ({session.formattedAnswers?.length || session.answers.length}件):
                      </p>
                      <div className="space-y-2">
                        {session.formattedAnswers && session.formattedAnswers.length > 0 ? (
                          // 포맷팅된 답변 (요약된 내용) 표시
                          session.formattedAnswers.map((answer, index) => (
                            <div key={answer.questionId} className="text-sm">
                              <span className="font-medium text-gray-600">
                                {answer.questionText}:
                              </span>{' '}
                              <span className="text-gray-800">{answer.extractedAnswer}</span>
                              {answer.confidence === 'low' && (
                                <span className="ml-2 text-xs text-orange-500">(低信頼度)</span>
                              )}
                            </div>
                          ))
                        ) : (
                          // 기존 답변 표시 (폴백)
                          session.answers.map((answer) => (
                            <div key={answer.id} className="text-sm">
                              <span className="font-medium text-gray-600">
                                {answer.questionText || answer.questionId}:
                              </span>{' '}
                              <span className="text-gray-800">{answer.answer}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 文診表管理 */}
        {activeTab === 'questionnaires' && (
          <div className="bg-white rounded-2xl shadow-yuyama p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                文診表テンプレート ({questionnaires.length}件)
              </h2>
              <button
                onClick={handleAddQuestionnaire}
                className="px-4 py-2 gradient-primary text-white rounded-lg hover:opacity-90 transition-all"
              >
                + 新規作成
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {questionnaires.map((questionnaire) => {
                const isDefault = DEFAULT_QUESTIONNAIRES.find((dq) => dq.id === questionnaire.id);

                return (
                  <div
                    key={questionnaire.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-[#0066CC] transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800">
                          {questionnaire.title}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {questionnaire.description}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          questionnaire.status === 'published'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {questionnaire.status === 'published' ? '公開' : '下書き'}
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 mb-3">
                      <p>カテゴリ: {questionnaire.category}</p>
                      <p>質問数: {questionnaire.questions.length}問</p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewQuestionnaire(questionnaire)}
                        className="flex-1 px-3 py-1 text-sm text-[#0066CC] border border-[#0066CC] rounded hover:bg-blue-50 transition-colors"
                      >
                        詳細
                      </button>
                      {!isDefault && (
                        <>
                          <button
                            onClick={() => handleEditQuestionnaire(questionnaire)}
                            className="flex-1 px-3 py-1 text-sm text-[#0066CC] border border-[#0066CC] rounded hover:bg-blue-50 transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteQuestionnaire(questionnaire.id)}
                            className="px-3 py-1 text-sm text-red-500 border border-red-500 rounded hover:bg-red-50 transition-colors"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

