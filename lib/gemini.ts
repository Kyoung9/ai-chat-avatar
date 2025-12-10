import { LLMResponse, Question, Answer } from '@/types';

// Google Gemini APIを使用してAI応答を生成
export async function generateAIResponse(
  currentQuestion: Question,
  userAnswer: string,
  conversationHistory: { role: string; content: string }[],
  apiKey: string
): Promise<LLMResponse> {
  try {
    const systemPrompt = `あなたは医療問診を担当する優しい女性アシスタントです。
患者さんに対して丁寧で親しみやすい日本語で対応してください。
症状を 時間・状況・強さ・頻度 で整理する。
When：いつから？どのくらいの期間？
Where：どこの部位？
What：どんな症状？
Why（Trigger）：何をすると悪化？改善？
How much：痛みの強さは？（0〜10で）

現在の質問: ${currentQuestion.text}
質問ID: ${currentQuestion.id}
質問タイプ: ${currentQuestion.type}
${currentQuestion.options ? `選択肢: ${currentQuestion.options.join(', ')}` : ''}

ユーザーの回答を確認し、以下のJSON形式で応答してください：
{
  "reply": "応答メッセージ（日本語）",
  "emotion": "neutral | gentle | thinking | serious | happy",
  "nextQuestionId": "次の質問ID（回答が十分な場合）",
  "isComplete": false
}

回答が不十分な場合は、優しく追加情報を求めてください。
回答が十分な場合は、次の質問に進むことを示してください。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userAnswer },
    ];

    // Gemini API呼び出し（実際のAPIエンドポイントに置き換える必要があります）
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            parts: [{ text: msg.content }],
          })),
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;
    console.log('Gemini raw response:', aiText);

    // JSON形式の応答をパース
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Gemini parsed response:', parsed);
        return parsed as LLMResponse;
      }
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
    }

    // JSONパースに失敗した場合のフォールバック
    return {
      reply: aiText,
      emotion: 'gentle',
      nextQuestionId: undefined,
      isComplete: false,
    };
  } catch (error) {
    console.error('AI応答生成エラー:', error);
    return {
      reply: '申し訳ございません。もう一度お願いできますか？',
      emotion: 'gentle',
      nextQuestionId: undefined,
      isComplete: false,
    };
  }
}

// Gemini APIを使用してTTS音声を生成（デモ用）
export async function generateTTS(text: string, apiKey: string): Promise<string | null> {
  try {
    // 注: Gemini APIは現在TTSをサポートしていないため、
    // 実際にはGoogle Cloud Text-to-Speech APIを使用する必要があります
    // ここではデモ用のプレースホルダーです
    
    console.log('TTS生成:', text);
    
    // Web Speech API（ブラウザ内蔵）を使用する場合は、
    // クライアント側で直接実行します
    return null;
  } catch (error) {
    console.error('TTS生成エラー:', error);
    return null;
  }
}

// ブラウザのWeb Speech APIを使用してTTSを再生
export function speakText(text: string, lang: string = 'ja-JP'): Promise<void> {
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
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
