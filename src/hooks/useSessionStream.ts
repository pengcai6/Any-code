/**
 * useSessionStream Hook
 *
 * 新架构的会话流管理 Hook
 * 使用 AsyncQueue + SessionConnection + SessionStore
 *
 * 特点：
 * - 流式消息处理通过 AsyncQueue
 * - 连接管理通过 SessionConnection
 * - 状态管理通过 SessionStore
 * - 支持多引擎（Claude、Codex、Gemini）
 */

import { useCallback, useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { api, type Session } from '@/lib/api';
import { normalizeUsageData } from '@/lib/utils';
import type { ClaudeStreamMessage } from '@/types/claude';
import type { CodexRateLimits } from '@/types/codex';
import {
  AsyncQueue,
  converterRegistry,
  type EngineType,
} from '@/lib/stream';
import { codexConverter } from '@/lib/codexConverter';
import { convertGeminiSessionDetailToClaudeMessages } from '@/lib/geminiConverter';

/**
 * Hook 配置
 */
interface UseSessionStreamConfig {
  /**
   * 当前会话
   */
  session: Session | undefined;

  /**
   * 组件挂载状态 ref
   */
  isMountedRef: React.MutableRefObject<boolean>;

  /**
   * 状态更新回调
   */
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<ClaudeStreamMessage[]>>;
  setRawJsonlOutput: React.Dispatch<React.SetStateAction<string[]>>;
  setClaudeSessionId: (sessionId: string) => void;
  setCodexRateLimits?: React.Dispatch<React.SetStateAction<CodexRateLimits | null>>;

  /**
   * 翻译处理
   */
  processMessageWithTranslation: (message: ClaudeStreamMessage, payload: string) => Promise<void>;

  /**
   * 会话不存在时的回调
   */
  onSessionNotFound?: () => void;
}

/**
 * Hook 返回值
 */
interface UseSessionStreamReturn {
  /**
   * 加载会话历史
   */
  loadSessionHistory: () => Promise<void>;

  /**
   * 检查活跃会话
   */
  checkForActiveSession: () => Promise<void>;

  /**
   * 重新连接到会话
   */
  reconnectToSession: (sessionId: string) => Promise<void>;

  /**
   * 消息队列
   */
  messageQueue: React.MutableRefObject<AsyncQueue<ClaudeStreamMessage> | null>;
}

/**
 * useSessionStream Hook
 */
export function useSessionStream(config: UseSessionStreamConfig): UseSessionStreamReturn {
  const {
    session,
    isMountedRef,
    setIsLoading,
    setError,
    setMessages,
    setRawJsonlOutput,
    setClaudeSessionId,
    setCodexRateLimits,
    processMessageWithTranslation,
    onSessionNotFound,
  } = config;

  // Refs
  const messageQueueRef = useRef<AsyncQueue<ClaudeStreamMessage> | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const isListeningRef = useRef(false);
  const loadingSessionIdRef = useRef<string | null>(null);

  /**
   * 获取引擎类型
   */
  const getEngine = useCallback((): EngineType => {
    const engine = (session as any)?.engine;
    if (engine === 'codex') return 'codex';
    if (engine === 'gemini') return 'gemini';
    return 'claude';
  }, [session]);

  /**
   * 清理监听器
   */
  const cleanupListeners = useCallback(() => {
    for (const unlisten of unlistenRefs.current) {
      try {
        unlisten();
      } catch (e) {
        console.warn('[useSessionStream] Failed to unlisten:', e);
      }
    }
    unlistenRefs.current = [];
    isListeningRef.current = false;
  }, []);

  /**
   * 处理消息
   */
  const processMessage = useCallback(async (
    message: ClaudeStreamMessage,
    rawPayload: string
  ) => {
    if (!isMountedRef.current) return;

    // 存储原始 JSONL
    setRawJsonlOutput(prev => [...prev, rawPayload]);

    // 通过翻译中间件处理
    await processMessageWithTranslation(message, rawPayload);
  }, [isMountedRef, setRawJsonlOutput, processMessageWithTranslation]);

  /**
   * 加载会话历史
   */
  const loadSessionHistory = useCallback(async () => {
    if (!session) return;

    const currentSessionId = session.id;
    loadingSessionIdRef.current = currentSessionId;

    try {
      setIsLoading(true);
      setError(null);

      const engine = getEngine();
      let history: ClaudeStreamMessage[] = [];

      // 根据引擎类型加载历史
      if (engine === 'gemini') {
        try {
          const geminiDetail = await api.getGeminiSessionDetail(session.project_path, session.id);
          history = convertGeminiSessionDetailToClaudeMessages(geminiDetail);
        } catch (err) {
          console.error('[useSessionStream] Failed to load Gemini session:', err);
          throw err;
        }
      } else {
        // Claude/Codex
        history = await api.loadSessionHistory(session.id, session.project_id, engine);

        // Codex 消息需要转换
        if (engine === 'codex') {
          codexConverter.reset();
          const converted: ClaudeStreamMessage[] = [];
          for (const event of history) {
            const msg = codexConverter.convertEventObject(event);
            if (msg) converted.push(msg);
          }
          history = converted;

          if (setCodexRateLimits) {
            setCodexRateLimits(codexConverter.getRateLimits());
          }
        }
      }

      // 过滤无效消息类型
      const validTypes = ['user', 'assistant', 'system', 'result', 'summary', 'thinking', 'tool_use'];
      const warnedTypes = new Set<string>();

      const loadedMessages: ClaudeStreamMessage[] = history
        .filter(entry => {
          const type = entry.type;
          if (type && !validTypes.includes(type)) {
            if (!warnedTypes.has(type)) {
              warnedTypes.add(type);
              console.debug('[useSessionStream] Filtering out message type:', type);
            }
            return false;
          }
          return true;
        })
        .map(entry => ({
          ...entry,
          type: entry.type || 'assistant',
        }));

      // 规范化 usage 数据
      const processedMessages = loadedMessages.map(msg => {
        if (msg.message?.usage) {
          msg.message.usage = normalizeUsageData(msg.message.usage);
        }
        if (msg.usage) {
          msg.usage = normalizeUsageData(msg.usage);
        }
        if ((msg as any).codexMetadata?.usage) {
          (msg as any).codexMetadata.usage = normalizeUsageData((msg as any).codexMetadata.usage);
        }

        // 将斜杠命令相关消息重新分类为 system
        if (msg.type === 'user') {
          const content = msg.message?.content;
          let textContent = '';

          if (typeof content === 'string') {
            textContent = content;
          } else if (Array.isArray(content)) {
            textContent = content
              .filter((item: any) => item?.type === 'text')
              .map((item: any) => item?.text || '')
              .join('\n');
          }

          const isCommandOutput = textContent.includes('<local-command-stdout>');
          const isCommandMeta = textContent.includes('<command-name>') || textContent.includes('<command-message>');
          const isCommandError = textContent.includes('Unknown slash command:');

          if (isCommandOutput || isCommandMeta || isCommandError) {
            return {
              ...msg,
              type: 'system' as const,
              subtype: isCommandOutput ? 'command-output' : isCommandError ? 'command-error' : 'command-meta',
            };
          }
        }

        return msg;
      });

      // 竞态条件检查
      if (loadingSessionIdRef.current !== currentSessionId) {
        console.debug('[useSessionStream] Session changed during loading, discarding results');
        return;
      }

      if (!isMountedRef.current) {
        console.debug('[useSessionStream] Component unmounted during loading');
        return;
      }

      // 更新状态
      setMessages(processedMessages);
      setRawJsonlOutput(history.map(h => JSON.stringify(h)));
      setIsLoading(false);

    } catch (err) {
      console.error('[useSessionStream] Failed to load session history:', err);

      if (loadingSessionIdRef.current !== currentSessionId) return;
      if (!isMountedRef.current) return;

      const errorMessage = err instanceof Error ? err.message : String(err);
      const isSessionNotFound = errorMessage.includes('Session file not found') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Session ID not found');

      if (isSessionNotFound) {
        console.debug('[useSessionStream] Session not found (new session), continuing');
        onSessionNotFound?.();
        setIsLoading(false);
        return;
      }

      setError('加载会话历史记录失败');
      setIsLoading(false);
    }
  }, [
    session,
    isMountedRef,
    getEngine,
    setIsLoading,
    setError,
    setMessages,
    setRawJsonlOutput,
    setCodexRateLimits,
    onSessionNotFound,
  ]);

  /**
   * 检查活跃会话
   */
  const checkForActiveSession = useCallback(async () => {
    if (!session) return;

    const engine = getEngine();
    if (engine === 'codex' || engine === 'gemini') return;

    const currentSessionId = session.id;

    try {
      const activeSessions = await api.listRunningClaudeSessions();

      if (loadingSessionIdRef.current !== currentSessionId) return;

      const activeSession = activeSessions.find((s: any) => {
        if ('process_type' in s && s.process_type && 'ClaudeSession' in s.process_type) {
          return (s.process_type as any).ClaudeSession.session_id === session.id;
        }
        return false;
      });

      if (activeSession) {
        setClaudeSessionId(session.id);
        await reconnectToSession(session.id);
      }
    } catch (err) {
      console.error('[useSessionStream] Failed to check active sessions:', err);
    }
  }, [session, getEngine, setClaudeSessionId]);

  /**
   * 重新连接到会话
   */
  const reconnectToSession = useCallback(async (sessionId: string) => {
    if (isListeningRef.current) return;

    cleanupListeners();
    setClaudeSessionId(sessionId);
    isListeningRef.current = true;

    const engine = getEngine();
    const eventPrefix = engine === 'codex' ? 'codex' : engine === 'gemini' ? 'gemini' : 'claude';

    // 创建消息队列
    messageQueueRef.current = new AsyncQueue<ClaudeStreamMessage>();

    // 监听输出
    const outputUnlisten = await listen<string>(
      `${eventPrefix}-output:${sessionId}`,
      async (event) => {
        try {
          if (!isMountedRef.current) return;

          const result = converterRegistry.convertLine(event.payload, engine);
          if (result.message) {
            messageQueueRef.current?.enqueue(result.message);
            await processMessage(result.message, event.payload);
          }
        } catch (err) {
          console.error('[useSessionStream] Failed to parse message:', err);
        }
      }
    );
    unlistenRefs.current.push(outputUnlisten);

    // 监听错误
    const errorUnlisten = await listen<string>(
      `${eventPrefix}-error:${sessionId}`,
      (event) => {
        console.error('[useSessionStream] Error:', event.payload);
        if (isMountedRef.current) {
          setError(event.payload);
        }
      }
    );
    unlistenRefs.current.push(errorUnlisten);

    // 监听完成
    const completeUnlisten = await listen<boolean>(
      `${eventPrefix}-complete:${sessionId}`,
      async () => {
        if (isMountedRef.current) {
          setIsLoading(false);
          messageQueueRef.current?.done();
          cleanupListeners();
        }
      }
    );
    unlistenRefs.current.push(completeUnlisten);

    setIsLoading(true);
  }, [
    isMountedRef,
    getEngine,
    setClaudeSessionId,
    setError,
    setIsLoading,
    processMessage,
    cleanupListeners,
  ]);

  // 清理
  useEffect(() => {
    return () => {
      cleanupListeners();
      messageQueueRef.current?.done();
    };
  }, [cleanupListeners]);

  return {
    loadSessionHistory,
    checkForActiveSession,
    reconnectToSession,
    messageQueue: messageQueueRef,
  };
}
