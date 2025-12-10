// 文診表の質問タイプ
export type QuestionType = 'text' | 'choice' | 'multiChoice' | 'scale';

// 感情タイプ
export type EmotionType = 'neutral' | 'gentle' | 'thinking' | 'serious' | 'happy';

// 質問の定義
export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  nextQuestionId?: string;
  branchLogic?: {
    condition: string;
    nextQuestionId: string;
  }[];
}

// 文診表の定義
export interface Questionnaire {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'published' | 'draft';
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}

// 答えの定義
export interface Answer {
  id: string;
  questionId: string;
  questionText: string; // 質問のテキストも保存
  answer: string;
  timestamp: number;
}

// 포맷팅된 답변 (요약 AI가 생성)
export interface FormattedAnswer {
  questionId: string;
  questionText: string;
  extractedAnswer: string;
  confidence: 'high' | 'medium' | 'low';
}

// セッションの定義
export interface Session {
  sessionId: string;
  questionnaireId: string;
  createdAt: number;
  answers: Answer[];
  currentQuestionIndex: number;
  isCompleted: boolean;
  // 요약 AI가 생성한 포맷팅된 답변
  formattedAnswers?: FormattedAnswer[];
  summary?: string;
}

// LLM応答フォーマット
export interface LLMResponse {
  reply: string;
  emotion: EmotionType;
  nextQuestionId?: string;
  isComplete?: boolean;
}

// チャットメッセージ
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotion?: EmotionType;
}

// 入力モード
export type InputMode = 'text' | 'voice';

// STT状態
export type STTStatus = 'idle' | 'listening' | 'processing' | 'silenceDetected';

// TTS状態
export type TTSStatus = 'idle' | 'speaking';

// アプリケーション状態
export interface AppState {
  currentSession: Session | null;
  currentQuestionnaire: Questionnaire | null;
  inputMode: InputMode;
  sttStatus: STTStatus;
  ttsStatus: TTSStatus;
  messages: ChatMessage[];
  isStarted: boolean;
}

// 文診表をLocalStorageから取得
export function getAllQuestionnaires(): Questionnaire[] {
  if (typeof window === 'undefined') return DEFAULT_QUESTIONNAIRES;

  const stored = localStorage.getItem('questionnaires');
  if (stored) {
    try {
      const custom = JSON.parse(stored);
      return [...DEFAULT_QUESTIONNAIRES, ...custom];
    } catch (e) {
      return DEFAULT_QUESTIONNAIRES;
    }
  }
  return DEFAULT_QUESTIONNAIRES;
}

// デフォルト文診表テンプレート
export const DEFAULT_QUESTIONNAIRES: Questionnaire[] = [
  {
    id: 'general-health',
    title: '一般健康チェック',
    description: '日常の健康状態を確認します',
    category: '健康',
    status: 'published',
    questions: [
      {
        id: 'Q1',
        text: '最近、体調に変化はありますか？',
        type: 'text',
        required: true,
      },
      {
        id: 'Q2',
        text: '睡眠時間は十分ですか？',
        type: 'choice',
        required: true,
        options: ['十分', 'やや不足', '不足'],
      },
      {
        id: 'Q3',
        text: '食欲はありますか？',
        type: 'choice',
        required: true,
        options: ['ある', 'やや減退', 'ない'],
      },
      {
        id: 'Q4',
        text: '運動習慣はありますか？',
        type: 'text',
        required: true,
      },
      {
        id: 'Q5',
        text: 'ストレスを感じることはありますか？',
        type: 'text',
        required: true,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'mental-check',
    title: 'メンタルコンディション簡易チェック',
    description: '心の健康状態を確認します',
    category: 'メンタルヘルス',
    status: 'published',
    questions: [
      {
        id: 'Q1',
        text: '最近、気分が落ち込むことはありますか？',
        type: 'scale',
        required: true,
      },
      {
        id: 'Q2',
        text: '趣味や楽しみを感じられますか？',
        type: 'text',
        required: true,
      },
      {
        id: 'Q3',
        text: '人と話すことが億劫に感じますか？',
        type: 'choice',
        required: true,
        options: ['はい', 'いいえ', 'どちらともいえない'],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

