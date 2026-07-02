import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useChat, type Message } from '@/context/chat-context';
import { api } from '@/lib/api';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';
import KnowledgeBaseSelector from '@/components/KnowledgeBaseSelector';
import { Trash2, Loader2, Settings2, ChevronUp } from 'lucide-react';

// 高级检索配置接口
interface SearchOptions {
  enableQueryRewrite?: boolean;      // 是否启用查询改写
  enableHybridSearch?: boolean;       // 是否启用混合检索（向量 + 关键词）
  enableRerank?: boolean;             // 是否启用 LLM 重排序
  topK?: number;                      // 返回结果数量
  minScore?: number;                  // 最低相似度阈值
  filter?: Record<string, any>;       // 元数据过滤条件
}

export default function UserChatPage() {
  const { state, sendMessage, setStreaming, appendStream, setError } = useChat();
  const [selectedKbId, setSelectedKbId] = useLocalStorage<string | null>(
    'selectedKnowledgeBase',
    null,
  );
  // 按知识库 ID 隔离存储对话历史，key 格式：chat-history-{kbId}
  // 使用 setter 以便在对话完成后保存历史记录
  const [history, setHistory] = useLocalStorage<Message[]>(`chat-history-${selectedKbId || 'default'}`, []);
  const [isSending, setIsSending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  
  // 高级检索设置状态
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [searchOptions, setSearchOptions] = useLocalStorage<SearchOptions>(
    'search-options',
    {
      enableQueryRewrite: false,
      enableHybridSearch: false,
      enableRerank: false,
      topK: 4,
      minScore: 0.3,
      filter: {},
    },
  );

  useEffect(() => {
    setStreaming(false);
  }, [setStreaming, selectedKbId]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isSending) return;
      setIsSending(true);
      setError(null);

      // 将用户消息添加到对话上下文（用于前端显示）
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
            // 请求完成回调：保存完整对话到 localStorage
            setStreaming(false);
            setIsSending(false);
            
            // 获取 AI 的完整回复内容（从当前消息列表中获取最后一条 assistant 消息）
            const lastMessage = state.messages[state.messages.length - 1];
            const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : '';
            
            // 将用户消息和 AI 回复保存到 localStorage
            // 这样下次查询时会作为上下文传递给后端，实现多轮对话
            setHistory((prev) => {
              // 限制历史记录数量，避免 localStorage 过大（保留最近 20 条对话，即 40 条消息）
              const newHistory: Message[] = [
                ...prev,
                { role: 'user', content: text, timestamp: Date.now() },
                { role: 'assistant', content: assistantContent, timestamp: Date.now() }
              ];
              return newHistory.slice(-40);
            });
          },
          (error: string) => {
            setError(error);
            setStreaming(false);
            setIsSending(false);
          },
          searchOptions, // 传递高级检索参数
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
      searchOptions,
      setHistory,
      state.messages,
    ],
  );

  const handleClearHistory = useCallback(() => {
    // 清空当前知识库的对话历史，并重置 chat-context 中的消息状态
    const key = `chat-history-${selectedKbId || 'default'}`;
    localStorage.removeItem(key);
    window.location.reload();
  }, [selectedKbId]);

  // 更新检索配置参数
  const updateSearchOption = useCallback(<K extends keyof SearchOptions>(
    key: K,
    value: SearchOptions[K],
  ) => {
    setSearchOptions((prev) => ({ ...prev, [key]: value }));
  }, [setSearchOptions]);

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
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className={`p-2 transition-colors rounded-lg ${
                showAdvancedSettings 
                  ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title="高级检索设置"
            >
              <Settings2 className="w-4 h-4" />
            </button>
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

      {/* 高级检索设置面板 */}
      {showAdvancedSettings && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700">高级检索设置</h2>
              <button
                onClick={() => setShowAdvancedSettings(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 查询改写 */}
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-700">查询改写</span>
                  <p className="text-xs text-gray-500 mt-1">使用 LLM 优化查询表达，扩展同义词</p>
                </div>
                <input
                  type="checkbox"
                  checked={searchOptions.enableQueryRewrite ?? false}
                  onChange={(e) => updateSearchOption('enableQueryRewrite', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>

              {/* 混合检索 */}
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-700">混合检索</span>
                  <p className="text-xs text-gray-500 mt-1">向量 + 关键词，提高精确匹配</p>
                </div>
                <input
                  type="checkbox"
                  checked={searchOptions.enableHybridSearch ?? false}
                  onChange={(e) => updateSearchOption('enableHybridSearch', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>

              {/* LLM 重排序 */}
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-700">LLM 重排序</span>
                  <p className="text-xs text-gray-500 mt-1">智能相关性排序（较慢）</p>
                </div>
                <input
                  type="checkbox"
                  checked={searchOptions.enableRerank ?? false}
                  onChange={(e) => updateSearchOption('enableRerank', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>

              {/* Top K 滑块 */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">返回数量 (Top K)</span>
                  <span className="text-xs text-gray-500">{searchOptions.topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={searchOptions.topK ?? 4}
                  onChange={(e) => updateSearchOption('topK', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>

              {/* 最低相似度阈值 */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">最低相似度</span>
                  <span className="text-xs text-gray-500">{(searchOptions.minScore ?? 0.3).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={searchOptions.minScore ?? 0.3}
                  onChange={(e) => updateSearchOption('minScore', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.0</span>
                  <span>1.0</span>
                </div>
              </div>

              {/* 文件名过滤 */}
              <div className="p-3 bg-gray-50 rounded-lg md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  文件名过滤（可选）
                </label>
                <input
                  type="text"
                  placeholder="输入文件名关键词进行过滤..."
                  value={searchOptions.filter?.filename || ''}
                  onChange={(e) => updateSearchOption('filter', e.target.value ? { filename: e.target.value } : {})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">仅检索包含该关键词的文档分片</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
