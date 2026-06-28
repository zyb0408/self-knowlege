import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SearchResult {
  filename: string;
  chunkIndex: number;
  score: number;
  content: string;
}

interface Props {
  searchResults: SearchResult[];
}

export default function SearchDebugPanel({ searchResults }: Props) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

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

  if (searchResults.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        暂无检索结果
      </div>
    );
  }

  const getScoreColor = (score: number): string => {
    if (score > 0.8) return 'bg-green-100 text-green-700';
    if (score > 0.6) return 'bg-yellow-100 text-yellow-700';
    return 'bg-orange-100 text-orange-700';
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">
        {searchResults.length} 个相关片段
      </p>

      {searchResults.map((result, index) => {
        const isExpanded = expandedItems.has(index);

        return (
          <div
            key={index}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggleExpanded(index)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-gray-800 flex-shrink-0">
                  {index + 1}.
                </span>
                <span className="text-sm text-gray-600 truncate">
                  {result.filename}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${getScoreColor(
                    result.score,
                  )}`}
                >
                  相似度: {result.score.toFixed(3)}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  Chunk #{result.chunkIndex}
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
            </button>

            {/* Content */}
            {isExpanded && (
              <div className="px-4 pb-3 border-t border-gray-100 pt-3">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto">
                  {result.content}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
