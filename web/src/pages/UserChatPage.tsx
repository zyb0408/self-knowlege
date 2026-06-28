import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useChat, type Message } from '@/context/chat-context';
import { api } from '@/lib/api';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';
import KnowledgeBaseSelector from '@/components/KnowledgeBaseSelector';
import { Trash2, Loader2 } from 'lucide-react';

export default function UserChatPage() {
  const { state, sendMessage, setStreaming, appendStream, setError } = useChat();
  const [selectedKbId, setSelectedKbId] = useLocalStorage<string | null>(
    'selectedKnowledgeBase',
    null,
  );
  const [isSending, setIsSending] = useState(false);
  const [history] = useLocalStorage<Message[]>(`chat-history-${selectedKbId || 'default'}`, []);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setStreaming(false);
  }, [setStreaming, selectedKbId]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isSending) return;
      setIsSending(true);
      setError(null);

      sendMessage(text);
      setStreaming(true);

      try {
        const controller = api.chatStream(
          selectedKbId ?? undefined,
          text,
          history,
          (chunk: string) => {
            appendStream(chunk);
          },
          () => {
            setStreaming(false);
            setIsSending(false);
            // Save to localStorage
            // The history is managed via localStorage in the hook
          },
          (error: string) => {
            setError(error);
            setStreaming(false);
            setIsSending(false);
          },
        );

        // Store controller for potential abort
        controllerRef.current = controller;
      } catch (err) {
        setError((err as Error).message);
        setStreaming(false);
        setIsSending(false);
      }
    },
    [
      isSending,
      selectedKbId,
      history,
      sendMessage,
      setStreaming,
      appendStream,
      setError,
    ],
  );

  const handleClearHistory = useCallback(() => {
    const key = `chat-history-${selectedKbId || 'default'}`;
    localStorage.removeItem(key);
    window.location.reload();
  }, [selectedKbId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">
            知识问答助手
          </h1>
          <div className="flex items-center gap-3">
            <KnowledgeBaseSelector
              selectedKbId={selectedKbId}
              onKbChange={setSelectedKbId}
            />
            <button
              onClick={handleClearHistory}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100"
              title="清空对话"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {state.error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="max-w-3xl mx-auto text-sm text-red-600">
            {state.error}
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-6">
          {state.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              开始对话吧！
            </div>
          ) : (
            <MessageList
              messages={state.messages}
              isStreaming={state.isStreaming}
            />
          )}
        </div>
      </main>

      {/* Input */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSubmit={handleSend}
            disabled={state.isStreaming || isSending}
          />
          {state.isStreaming && (
            <div className="flex items-center justify-center gap-2 mt-2 text-sm text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>正在生成回复...</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
