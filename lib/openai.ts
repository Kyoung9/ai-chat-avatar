import { LLMResponse, Question, AnalysisResponse } from '@/types';

// 最大リトライ回数
const MAX_RETRIES = 2;
// リトライ間隔（ミリ秒）
const RETRY_DELAY = 1000;

// 遅延ユーティリティ
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 【1段階AI】ユーザーの回答を分析し、どの質問に答えたかを判定
export async function analyzeUserAnswer(
  userAnswer: string,
  allQuestions: Question[],
  answeredQuestionIds: string[],
  apiKey: string
): Promise<AnalysisResponse> {
  // 未回答の質問のみをリストアップ
  const unansweredQuestions = allQuestions
    .filter(q => !answeredQuestionIds.includes(q.id))
    .map(q => `[ID: ${q.id}] ${q.text}`)
    .join('\n');

  const systemPrompt = `あなたは医療問診の回答分析の専門家です。
患者の回答を分析し、どの質問に対する答えが含まれているかを判定してください。

【未回答の質問リスト】
${unansweredQuestions}

【タスク】
患者の回答から、上記の未回答質問に対する答えが含まれている場合、その質問IDをすべて抽出してください。

【判定基準】
- 明確に答えが含まれている質問のみを抽出
- 推測や曖昧な情報は含めない
- 例：「2時間しか寝れてない」→ 睡眠時間の質問に該当
- 例：「頭痛と熱があります」→ 体調変化の質問に該当
- 例：「食欲はあります」→ 食欲の質問に該当

必ず以下のJSON形式で応答してください：
{
  "answeredQuestions": ["Q1", "Q2"]
}

answeredQuestionsが空の場合は空配列を返してください：
{
  "answeredQuestions": []
}`;

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
          { role: 'user', content: `患者の回答: ${userAnswer}` },
        ],
        temperature: 0.1, // 低温度で一貫性を確保
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiText = data.choices[0].message.content;
    const parsed = JSON.parse(aiText);

    console.log('【1段階AI】分析結果:', parsed);

    return {
      answeredQuestions: parsed.answeredQuestions || [],
    };
  } catch (error) {
    console.error('【1段階AI】分析エラー:', error);
    // エラー時は空配列を返す
    return {
      answeredQuestions: [],
    };
  }
}

// 【2段階AI】対話を生成（単純化版）
export async function generateAIResponse(
  currentQuestion: Question,
  userAnswer: string,
  conversationHistory: { role: string; content: string }[],
  apiKey: string,
  isLastQuestion: boolean
): Promise<LLMResponse> {
  // 単純化されたプロンプト
  const systemPrompt = `あなたは優しい医療問診アシスタントです。

現在の質問: ${currentQuestion.text}

【あなたの役割】
1. 患者の回答に対して、優しく丁寧に応答する
2. 症状に関する質問では、詳細情報（各症状の開始時期、他の症状、程度、場所）を確認する
3. 十分な情報が得られたかを判断する

【重要】症状が複数ある場合の対応:
- 複数の症状がある場合、「それぞれいつ頃から感じていますか？」と聞く
- 例: 「頭痛と熱があるのですね。それぞれいつ頃から感じていますか？」
- 患者が「頭痛は2週間前から、熱は昨日から」のように答えた場合、各症状の時期を確認

【応答ルール】
- 症状の質問: 基本情報を得た後、各症状の「いつから」「他の症状」「場所」を確認
- その他の質問: 明確な答えが得られたら次へ進む
- 追加情報が必要な場合: needMoreInfo = true
- 十分な情報が得られた場合: needMoreInfo = false

必ず以下のJSON形式で応答してください：
{
  "reply": "患者への応答文",
  "emotion": "gentle",
  "needMoreInfo": true または false,
  "isComplete": ${isLastQuestion ? 'true または false' : 'false'}
}

例1（複数症状の詳細確認）:
患者「頭痛と熱があります」
→ {"reply": "頭痛と熱があるのですね。それぞれいつ頃から感じていますか？", "emotion": "gentle", "needMoreInfo": true, "isComplete": false}

例2（各症状の時期を確認）:
患者「頭痛は2週間前から、熱は昨日からです」
→ {"reply": "頭痛は2週間前から、熱は昨日からなのですね。他に気になる症状はありますか？", "emotion": "gentle", "needMoreInfo": true, "isComplete": false}

例3（十分な情報を得た）:
患者「他の症状はありません」
→ {"reply": "わかりました。ありがとうございます。", "emotion": "gentle", "needMoreInfo": false, "isComplete": false}

例4（その他の質問）:
患者「食欲はあります」
→ {"reply": "食欲があるのですね。わかりました。", "emotion": "gentle", "needMoreInfo": false, "isComplete": false}`;

  // 会話履歴が長すぎる場合は最新のものだけ保持 (토큰 제한 문제 방지)
  const maxHistoryLength = 10; // 최근 10개 메시지만 유지 (user-assistant 5쌍) - 컨텍스트 증가
  const trimmedHistory = conversationHistory.length > maxHistoryLength
    ? conversationHistory.slice(-maxHistoryLength)
    : conversationHistory;

  // 회화 히스토리에서 공백만 있는 메시지 필터링 및 길이 제한
  const cleanedHistory = trimmedHistory
    .filter(msg => {
      const cleaned = msg.content
        .replace(/[\r\n\t\f\v\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, ' ')
        .trim();
      return cleaned.length > 0;
    })
    .map(msg => ({
      role: msg.role,
      content: msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content
    }));
  const estimatedTokens = JSON.stringify(systemPrompt).length +
    JSON.stringify(cleanedHistory).length +
    JSON.stringify(userAnswer).length;
  console.log('Total prompt chars (estimated):', estimatedTokens);

  if (estimatedTokens > 3000) {
    console.warn('⚠️ Prompt too long! Estimated chars:', estimatedTokens);
  }
 // 이미 얻은 정보를 요약해서 AI에게 알려줌
 const alreadyAnswered: string[] = [];
 for (let i = cleanedHistory.length - 1; i >= 0; i--) {
   const msg = cleanedHistory[i];
   if (msg.role === 'user' && msg.content.trim().length > 0) {
     alreadyAnswered.push(msg.content);
   }
 }

 const contextReminder = alreadyAnswered.length > 0
   ? `\n\n【患者が既に答えた情報】\n${alreadyAnswered.slice(0, 3).join('\n')}\n上記の情報は再度聞かないこと。`
   : '';

  const messages = [
    { role: 'system', content: systemPrompt+ contextReminder },
    ...cleanedHistory,
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
          temperature: 0.4,
          max_tokens: 1024, // 응답용 토큰 증가 (JSON 응답 + 여유)
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
      console.log('OpenAI raw response:', aiText);
      console.log('OpenAI raw response length:', aiText?.length);
      console.log('OpenAI finish_reason:', data.choices[0].finish_reason);

      // 빈 응답 체크
      if (!aiText || typeof aiText !== 'string') {
        console.error('OpenAI API가 빈 응답을 반환함:', { aiText, finishReason: data.choices[0].finish_reason });
        lastError = new Error('Empty response from API');
        continue;
      }

      // 공백만 있는 응답 체크 (모든 종류의 공백 문자 제거)
      const cleanedText = aiText
        .replace(/[\r\n\t\f\v\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, '')
        .trim();

      if (!cleanedText || cleanedText.length < 5) {
        console.error('OpenAI API가 공백만 있는 응답을 반환함:', {
          original: JSON.stringify(aiText.substring(0, 100)),
          originalLength: aiText.length,
          cleaned: cleanedText,
          cleanedLength: cleanedText.length,
          finishReason: data.choices[0].finish_reason,
          charCodes: Array.from(aiText.slice(0, 20)).map(c => `${c}(${c.charCodeAt(0)})`).join(' ')
        });
        lastError = new Error('Whitespace-only response from API');
        continue;
      }

      // JSON形式の応답をパース
      try {
        // JSON 부분만 추출 시도
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : aiText;
        const parsed = JSON.parse(jsonText);

        // 필수 필드 검증
        if (!parsed.reply || typeof parsed.reply !== 'string') {
          console.error('응답에 reply 필드가 없음:', parsed);
          lastError = new Error('Missing reply field in response');
          continue;
        }

        console.log('OpenAI parsed response:', parsed);

        // reply 필드도 공백만 있는지 체크
        const replyClean = parsed.reply
          .replace(/[\r\n\t\f\v\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, ' ')
          .trim();

        if (!replyClean || replyClean.length < 2) {
          console.error('reply 필드가 공백만 포함:', {
            original: parsed.reply,
            cleaned: replyClean
          });
          lastError = new Error('Reply field contains only whitespace');
          continue;
        }

        console.log('【2段階AI】応答:', parsed);

        return {
          reply: parsed.reply,
          emotion: parsed.emotion || 'gentle',
          needMoreInfo: parsed.needMoreInfo !== undefined ? parsed.needMoreInfo : true,
          isComplete: parsed.isComplete || false,
        } as LLMResponse;
      } catch (e) {
        console.error('Failed to parse AI response as JSON:', {
          error: e,
          originalText: aiText.slice(0, 200),
          cleanedText: cleanedText.slice(0, 200),
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
    needMoreInfo: true,
    isComplete: false,
  };
}

// OpenAI TTS APIを使用して音声を生成・再生
export async function speakText(
  text: string,
  apiKey: string,
  onPlayStart?: () => void
): Promise<void> {
  try {
    if (!apiKey) {
      console.warn('OpenAI API key not found, falling back to Web Speech API');
      return speakTextWithWebAPI(text, onPlayStart);
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

      // 音声再生が実際に開始されたときのイベント
      audio.onplay = () => {
        console.log('Audio playback started');
        onPlayStart?.();
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
    return speakTextWithWebAPI(text, onPlayStart);
  }
}

// ブラウザのWeb Speech APIを使用してTTSを再生（フォールバック）
function speakTextWithWebAPI(
  text: string,
  onPlayStart?: () => void,
  lang: string = 'ja-JP'
): Promise<void> {
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

    // 音声再生が開始されたときのイベント
    utterance.onstart = () => {
      console.log('Web Speech API playback started');
      onPlayStart?.();
    };

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
- 患者は一度の回答で複数の質問に答えている場合があります
  例：「最近 2時間しか寝れてなくて頭痛と熱があります」
  → 睡眠時間（2時間）、症状（頭痛、発熱）の情報が含まれる
- 会話全体の文脈から、各質問に最も適切な回答を見つけてください
- 回答が見つからない質問には「回答なし」と記載してください
- 挨拶や関係のない発言は無視してください
- 同じ質問に対して複数回の応答がある場合（追加質問で詳細を聞いた場合）、すべての情報を統合して簡潔にまとめてください

【回答のフォーマットルール】
- 回答は簡潔に、テーブル形式でまとめてください
- 症状に関する質問の場合、各症状と開始時期を分けて記載
- 例（症状）:
  「頭痛: 2週間前から
  発熱: 昨日から (38度)
  倦怠感: 3日前から」
- 例（その他）: 「2時間」「週3回ジム通い」「ストレスなし」
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
    console.log('OpenAI summary raw response:', aiText);

    const parsed = JSON.parse(aiText);
    console.log('OpenAI summary parsed response:', parsed);
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
