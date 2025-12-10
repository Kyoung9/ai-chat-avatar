import { LLMResponse, Question } from '@/types';

// 最大リトライ回数
const MAX_RETRIES = 2;
// リトライ間隔（ミリ秒）
const RETRY_DELAY = 1000;

// 遅延ユーティリティ
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// OpenAI APIを使用してAI応答を生成
export async function generateAIResponse(
  currentQuestion: Question,
  userAnswer: string,
  conversationHistory: { role: string; content: string }[],
  apiKey: string,
  currentQuestionIndex?: number,
  totalQuestions?: number,
  nextQuestion?: Question | null
): Promise<LLMResponse> {
  const questionProgress = currentQuestionIndex !== undefined && totalQuestions !== undefined
    ? `\n現在の進行状況: ${currentQuestionIndex + 1}問目 / 全${totalQuestions}問`
    : '';

  const isLastQuestion = currentQuestionIndex !== undefined && totalQuestions !== undefined
    && currentQuestionIndex >= totalQuestions - 1;

  const nextQuestionInfo = nextQuestion
    ? `\n次の質問: 「${nextQuestion.text}」`
    : '';

  const systemPrompt = `あなたは医療問診を担当する優しい女性アシスタントです。
患者さんに対して丁寧で親しみやすい日本語で対応してください。
${questionProgress}

現在の質問: ${currentQuestion.text}
質問ID: ${currentQuestion.id}
${nextQuestionInfo}

【症状ヒアリングの5W1Hフレームワーク】
症状に関する質問（例：体調の変化、痛み、不調など）の場合、以下の5つの観点で情報を収集してください：
- When（いつ）：いつから始まった？どのくらいの期間続いている？
- Where（どこ）：どの部位に症状がある？
- What（何が）：具体的にどんな症状？（痛い、だるい、かゆいなど）
- Why/Trigger（きっかけ）：何をすると悪化する？何をすると改善する？
- How much（程度）：症状の強さは？（0〜10のスケールで）

【情報収集の進め方】
1. 患者の回答から、上記5項目のどれが既に回答されたかを判断してください
2. まだ回答されていない項目があれば、優しく1つずつ追加で質問してください
3. 症状に関係ない質問（睡眠時間、運動習慣など）は5W1Hを適用せず、回答が得られたら次へ進んでください

【重要なルール】
1. 回答が十分かどうかを判断してください
   - 症状に関する質問：5W1Hの必要な項目が埋まっているか確認
   - それ以外の質問：質問に対する直接的な回答があるか確認
2. 回答が十分な場合：
   - 短く確認の返事をした後、すぐに次の質問をしてください
   - 必ず「次の質問に進みます」などと言わず、直接次の質問をしてください
   - nextQuestionIdを必ず"next"に設定してください
   ${isLastQuestion ? '- これが最後の質問なので、isCompleteをtrueに設定してください' : ''}
3. 回答が不十分な場合：
   - 不足している情報を1つ選んで、優しく追加質問をしてください
   - 例：「なるほど、頭が痛いのですね。いつ頃から痛み始めましたか？」
   - 例：「ありがとうございます。痛みの強さを0〜10で表すと、どのくらいですか？」
   - nextQuestionIdはnullのままにしてください

【応答形式】JSON形式で応答してください：
{
  "reply": "応答メッセージ（確認＋${isLastQuestion ? '感謝の言葉' : '次の質問を直接含める、または不足情報の追加質問'}）",
  "emotion": "neutral | gentle | thinking | serious | happy",
  "nextQuestionId": ${isLastQuestion ? 'null' : '"next"（回答が十分な場合）またはnull（不十分な場合）'},
  "isComplete": ${isLastQuestion ? 'true（回答が十分な場合）またはfalse' : 'false'}
}`;

  // 会話履歴が長すぎる場合は最新のものだけ保持
  const maxHistoryLength = 20;
  const trimmedHistory = conversationHistory.length > maxHistoryLength
    ? conversationHistory.slice(-maxHistoryLength)
    : conversationHistory;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
    { role: 'user', content: userAnswer },
  ];

  let lastError: Error | null = null;

  // リトライロジック
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`OpenAI API リトライ中... (${attempt}/${MAX_RETRIES})`);
        await delay(RETRY_DELAY * attempt);
      }

      // OpenAI API呼び出し
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.3,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API error:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });

        // 레이트 리밋이나 서버 에러는 재시도
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`OpenAI API error: ${response.status} - ${response.statusText}`);
          continue;
        }

        throw new Error(`OpenAI API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      // 응답 구조 검증
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('OpenAI API 응답 구조가 올바르지 않음:', data);
        lastError = new Error('Invalid API response structure');
        continue;
      }

      const aiText = data.choices[0].message.content;

      // 빈 응답 체크
      if (!aiText || typeof aiText !== 'string') {
        console.error('OpenAI API가 빈 응답을 반환함:', { aiText, finishReason: data.choices[0].finish_reason });
        lastError = new Error('Empty response from API');
        continue;
      }

      // 공백만 있는 응답 체크
      const cleanedText = aiText.trim().replace(/[\n\r\s]+/g, ' ').trim();
      if (!cleanedText || cleanedText.length < 2) {
        console.error('OpenAI API가 공백만 있는 응답을 반환함:', {
          original: aiText,
          cleaned: cleanedText,
          finishReason: data.choices[0].finish_reason
        });
        lastError = new Error('Whitespace-only response from API');
        continue;
      }

      // JSON形式の応答をパース
      try {
        // JSON 부분만 추출 시도
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : cleanedText;
        const parsed = JSON.parse(jsonText);

        // 필수 필드 검증
        if (!parsed.reply || typeof parsed.reply !== 'string') {
          console.error('응답에 reply 필드가 없음:', parsed);
          lastError = new Error('Missing reply field in response');
          continue;
        }

        return {
          reply: parsed.reply,
          emotion: parsed.emotion || 'gentle',
          nextQuestionId: parsed.nextQuestionId,
          isComplete: parsed.isComplete || false,
        } as LLMResponse;
      } catch (e) {
        console.error('Failed to parse AI response as JSON:', {
          error: e,
          originalText: aiText,
          cleanedText: cleanedText,
        });
        lastError = e as Error;
        continue;
      }
    } catch (error) {
      console.error(`AI応答生成エラー (attempt ${attempt + 1}):`, error);
      lastError = error as Error;

      // 네트워크 에러 등은 재시도
      if (error instanceof TypeError && error.message.includes('fetch')) {
        continue;
      }

      // 그 외 에러는 즉시 실패
      break;
    }
  }

  // 모든 재시도 실패 시 폴백
  console.error('OpenAI API 모든 재시도 실패:', lastError);
  return {
    reply: '申し訳ございません。通信エラーが発生しました。もう一度お願いできますか？',
    emotion: 'gentle',
    nextQuestionId: undefined,
    isComplete: false,
  };
}

// OpenAI TTS APIを使用して音声を生成・再生
export async function speakText(text: string, apiKey: string): Promise<void> {
  try {
    if (!apiKey) {
      console.warn('OpenAI API key not found, falling back to Web Speech API');
      return speakTextWithWebAPI(text);
    }

    // OpenAI TTS API呼び出し
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova', // 女性の声: alloy, echo, fable, onyx, nova, shimmer
        input: text,
        speed: 1.11,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS API error: ${response.statusText}`);
    }

    // 音声データを取得
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // Audio要素で再生
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };

      audio.onerror = (error) => {
        console.error('音声再生エラー:', error);
        URL.revokeObjectURL(audioUrl);
        reject(error);
      };

      // 既存の音声を停止
      stopSpeaking();

      // グローバルに保存して停止できるようにする
      if (typeof window !== 'undefined') {
        (window as any).currentAudio = audio;
      }

      audio.play().catch((err) => {
        console.error('audio.play() 失敗:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('OpenAI TTS エラー:', error);
    // フォールバック: Web Speech APIを使用
    return speakTextWithWebAPI(text);
  }
}

// ブラウザのWeb Speech APIを使用してTTSを再生（フォールバック）
function speakTextWithWebAPI(text: string, lang: string = 'ja-JP'): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      reject(new Error('Speech Synthesis APIがサポートされていません'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;

    utterance.onend = () => resolve();
    utterance.onerror = (error) => reject(error);

    // 既存の発話を停止
    window.speechSynthesis.cancel();
    
    // 新しい発話を開始
    window.speechSynthesis.speak(utterance);
  });
}

// TTS再生を停止
export function stopSpeaking(): void {
  // OpenAI TTS Audio停止
  if (typeof window !== 'undefined' && (window as any).currentAudio) {
    const audio = (window as any).currentAudio as HTMLAudioElement;
    audio.pause();
    audio.currentTime = 0;
    (window as any).currentAudio = null;
  }
  
  // Web Speech API停止
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// 요약 응답 타입
export interface SummaryResponse {
  formattedAnswers: {
    questionId: string;
    questionText: string;
    extractedAnswer: string;
    confidence: 'high' | 'medium' | 'low';
  }[];
  summary: string;
}

// 要約AIを使用して会話から回答を抽出・フォーマット
export async function generateSummary(
  questions: Question[],
  conversationHistory: { role: string; content: string }[],
  apiKey: string
): Promise<SummaryResponse> {
  const questionsInfo = questions.map((q, i) =>
    `${i + 1}. [ID: ${q.id}] ${q.text}`
  ).join('\n');

  const systemPrompt = `あなたは医療問診の回答を分析・整理する専門家です。
以下の会話履歴を分析し、各質問に対する患者の回答を抽出してください。

【重要な注意事項】
- 患者は質問の順番通りに回答していない場合があります
- 会話全体の文脈から、各質問に最も適切な回答を見つけてください
- 回答が見つからない質問には「回答なし」と記載してください
- 挨拶や関係のない発言は無視してください
- 同じ質問に対して複数回の応答がある場合（追加質問で詳細を聞いた場合）、すべての情報を統合して簡潔にまとめてください

【回答のフォーマットルール】
- 回答は簡潔に、キーワードや要点のみを抽出してください
- 長い説明は避け、箇条書き風にまとめてください
- 例：「発熱39度、昨日から、体のだるさあり、他の症状なし」
- 例：「10時間」「週3回ジム通い」「ストレスなし」
- 「よろしくお願いします」などの挨拶は除外してください

【質問リスト】
${questionsInfo}

以下のJSON形式で応答してください：
{
  "formattedAnswers": [
    {
      "questionId": "質問ID",
      "questionText": "質問テキスト",
      "extractedAnswer": "簡潔にまとめた回答（キーワード・要点のみ）",
      "confidence": "high | medium | low"
    }
  ],
  "summary": "問診全体の簡潔な要約（2-3文）"
}`;

  const conversationText = conversationHistory
    .map(m => `${m.role === 'user' ? '患者' : 'アシスタント'}: ${m.content}`)
    .join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `【会話履歴】\n${conversationText}` },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiText = data.choices[0].message.content;

    const parsed = JSON.parse(aiText);
    return parsed as SummaryResponse;
  } catch (error) {
    console.error('要約生成エラー:', error);

    // フォールバック: 元の回答をそのまま返す
    return {
      formattedAnswers: questions.map(q => ({
        questionId: q.id,
        questionText: q.text,
        extractedAnswer: '回答の抽出に失敗しました',
        confidence: 'low' as const,
      })),
      summary: '要約の生成に失敗しました。',
    };
  }
}
