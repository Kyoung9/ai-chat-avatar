import { Session } from '@/types';

const STORAGE_KEY = 'questionnaire_sessions';
const EXPIRY_TIME = 60 * 60 * 1000; // 1時間

// セッションを保存
export function saveSession(session: Session): void {
  try {
    const sessions = getAllSessions();
    const index = sessions.findIndex(s => s.sessionId === session.sessionId);
    
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('セッション保存エラー:', error);
  }
}

// すべてのセッションを取得
export function getAllSessions(): Session[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const sessions: Session[] = JSON.parse(data);
    return sessions;
  } catch (error) {
    console.error('セッション取得エラー:', error);
    return [];
  }
}

// セッションIDで取得
export function getSession(sessionId: string): Session | null {
  const sessions = getAllSessions();
  return sessions.find(s => s.sessionId === sessionId) || null;
}

// 期限切れセッションを削除
export function cleanExpiredSessions(): void {
  try {
    const sessions = getAllSessions();
    const now = Date.now();
    
    const validSessions = sessions.filter(session => {
      const age = now - session.createdAt;
      return age < EXPIRY_TIME;
    });
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validSessions));
    
    const removedCount = sessions.length - validSessions.length;
    if (removedCount > 0) {
      console.log(`${removedCount}件の期限切れセッションを削除しました`);
    }
  } catch (error) {
    console.error('期限切れセッション削除エラー:', error);
  }
}

// セッションを削除
export function deleteSession(sessionId: string): void {
  try {
    const sessions = getAllSessions();
    const filtered = sessions.filter(s => s.sessionId !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('セッション削除エラー:', error);
  }
}

// すべてのセッションをクリア
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('セッションクリアエラー:', error);
  }
}

