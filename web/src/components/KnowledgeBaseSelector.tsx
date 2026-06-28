import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { BookOpen, ChevronDown } from 'lucide-react';

interface KnowledgeBase {
  id: string;
  name: string;
}

interface Props {
  selectedKbId: string | null;
  onKbChange: (kbId: string | null) => void;
}

export default function KnowledgeBaseSelector({
  selectedKbId,
  onKbChange,
}: Props) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .getKnowledgeBases()
      .then((data) => {
        setKbs(data as KnowledgeBase[]);
      })
      .catch(() => {
        // Ignore
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSelect = useCallback(
    (id: string | null) => {
      onKbChange(id);
      setOpen(false);
    },
    [onKbChange],
  );

  const selectedKb = kbs.find((kb) => kb.id === selectedKbId);
  const label = selectedKb ? selectedKb.name : '默认 (无知识库)';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
      >
        <BookOpen className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-gray-700">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                !selectedKbId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
              }`}
            >
              <span className="w-3.5 h-3.5 border border-gray-300 rounded-full flex-shrink-0" />
              默认 (无知识库)
            </button>
            <div className="border-t border-gray-100" />
            {kbs.map((kb) => (
              <button
                key={kb.id}
                onClick={() => handleSelect(kb.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                  selectedKbId === kb.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 border flex-shrink-0 rounded-full flex items-center justify-center ${
                    selectedKbId === kb.id
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-gray-300'
                  }`}
                >
                  {selectedKbId === kb.id && (
                    <span className="w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </span>
                <span className="truncate">{kb.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
