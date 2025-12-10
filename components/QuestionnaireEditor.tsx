'use client';

import { useState } from 'react';
import { Questionnaire, Question } from '@/types';

interface QuestionnaireEditorProps {
  questionnaire: Questionnaire | null;
  onSave: (questionnaire: Questionnaire) => void;
  onCancel: () => void;
}

export default function QuestionnaireEditor({
  questionnaire,
  onSave,
  onCancel,
}: QuestionnaireEditorProps) {
  const [title, setTitle] = useState(questionnaire?.title || '');
  const [description, setDescription] = useState(questionnaire?.description || '');
  const [category, setCategory] = useState(questionnaire?.category || '');
  const [questions, setQuestions] = useState<Question[]>(questionnaire?.questions || []);

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: `Q${questions.length + 1}`,
      text: '',
      type: 'text',
      required: true,
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleUpdateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const savedQuestionnaire: Questionnaire = {
      id: questionnaire?.id || `questionnaire-${Date.now()}`,
      title,
      description,
      category,
      status: 'published',
      questions,
      createdAt: questionnaire?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    onSave(savedQuestionnaire);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8">
        {/* ヘッダー */}
        <div className="gradient-primary text-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-2xl font-bold">
            {questionnaire ? '文診表を編集' : '新しい文診表を作成'}
          </h2>
        </div>

        {/* コンテンツ */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* 基本情報 */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                タイトル
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                placeholder="例: 一般健康診断"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                説明
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                rows={2}
                placeholder="文診表の説明を入力してください"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                カテゴリ
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                placeholder="例: 健康診断"
              />
            </div>
          </div>

          {/* 質問リスト */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">質問</h3>
              <button
                onClick={handleAddQuestion}
                className="px-4 py-2 bg-[#0066CC] text-white rounded-lg hover:bg-[#0d4a87] transition-colors"
              >
                + 質問を追加
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((question, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-gray-600">
                      質問 {index + 1}
                    </span>
                    <button
                      onClick={() => handleDeleteQuestion(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      削除
                    </button>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={question.text}
                      onChange={(e) =>
                        handleUpdateQuestion(index, 'text', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                      placeholder="質問内容を入力してください"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title || !description || questions.length === 0}
            className="px-6 py-2 gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

