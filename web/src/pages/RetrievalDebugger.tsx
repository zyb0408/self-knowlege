import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import KnowledgeBaseSelector from '@/components/KnowledgeBaseSelector';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';

interface RetrievalResult {
  filename: string;
  chunkIndex: number;
  score: number;
  text: string;
}

export default function RetrievalDebugger() {
  const [query, setQuery] = useState('');
  const [selectedKbId, setSelectedKbId] = useLocalStorage<string | null>(
    'debug-knowledge-base',
    null,
  );
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const handleDebug = useCallback(async () => {
    if (!selectedKbId || !query.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await api.debugRetrieval(selectedKbId, query, topK);
      setResults((data as { results?: RetrievalResult[] })?.results || (data as any) || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedKbId, query, topK]);

  const toggleExpanded = useCallback((index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        检索调试
      </h2>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        {/* Query Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            调试查询
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            placeholder="输入查询文本进行检索调试..."
          />
        </div>

        {/* Controls */}
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              知识库
            </label>
            <div className="w-48">
              <KnowledgeBaseSelector
                selectedKbId={selectedKbId}
                onKbChange={setSelectedKbId}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Top K
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <button
            onClick={handleDebug}
            disabled={loading || !selectedKbId || !query.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
          >
            <Search className="w-4 h-4" />
            {loading ? '搜索中...' : '检索'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">
            找到 {results.length} 个相关片段
          </p>

          {results.map((result, index) => {
            const isExpanded = expandedItems.has(index);
            const scoreColor =
              result.score > 0.8
                ? 'bg-green-100 text-green-700'
                : result.score > 0.6
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-orange-100 text-orange-700';

            return (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* Result Header */}
                <button
                  onClick={() => toggleExpanded(index)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">
                      {index + 1}. {result.filename}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${scoreColor}`}>
                      相似度: {result.score.toFixed(3)}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {/* Result Content */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
                      <span>
                        Chunk Index: {result.chunkIndex}
                      </span>
                      <span>
                        相似度：{result.score.toFixed(3)}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {result.text}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
