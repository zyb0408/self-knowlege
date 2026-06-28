import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Save, Globe, Brain, Search, FileText } from 'lucide-react';

interface FormValues {
  name: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  embedding: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  retrieval: {
    topK: number;
    similarityThreshold: number;
    distanceMetric: 'cosine' | 'l2';
  };
  chunking: {
    chunkSize: number;
    chunkOverlap: number;
  };
  systemPrompt: string;
}

const defaultForm: FormValues = {
  name: '',
  llm: { baseUrl: '', apiKey: '', model: '' },
  embedding: { baseUrl: '', apiKey: '', model: '' },
  retrieval: { topK: 5, similarityThreshold: 0.7, distanceMetric: 'cosine' },
  chunking: { chunkSize: 500, chunkOverlap: 50 },
  systemPrompt: '',
};

export default function KnowledgeBaseForm() {
  const [form, setForm] = useState<FormValues>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(
    (section: keyof FormValues, field: string, value: string | number) => {
      setForm((prev) => ({
        ...prev,
        [section]:
          typeof prev[section] === 'object' && prev[section] !== null
            ? { ...prev[section], [field]: value }
            : value,
      }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.name.trim()) {
        setError('请输入知识库名称');
        return;
      }
      setSaving(true);
      setError(null);
      setSuccess(false);

      try {
        await api.createKnowledgeBase(form);
        setSuccess(true);
        setForm(defaultForm);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [form],
  );

  const FieldLabel = ({
    label,
    required,
    hint,
  }: {
    label: string;
    required?: boolean;
    hint?: string;
  }) => (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {hint && <span className="text-gray-400 ml-1 text-xs">{hint}</span>}
    </label>
  );

  const Section = ({
    title,
    icon: Icon,
    children,
  }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
  }) => (
    <div className="bg-gray-50 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-indigo-500" />
        <h3 className="font-medium text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">创建知识库</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg px-4 py-3">
            知识库创建成功！
          </div>
        )}

        {/* Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <FieldLabel label="知识库名称" required />
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', 'name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="输入知识库名称"
          />
        </div>

        {/* LLM Config */}
        <Section title="LLM 配置" icon={Globe}>
          <div className="space-y-4">
            <div>
              <FieldLabel label="Base URL" required hint="如 https://api.openai.com" />
              <input
                type="text"
                value={form.llm.baseUrl}
                onChange={(e) => updateField('llm', 'baseUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="https://api.openai.com"
              />
            </div>
            <div>
              <FieldLabel label="API Key" required />
              <input
                type="text"
                value={form.llm.apiKey}
                onChange={(e) => updateField('llm', 'apiKey', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="sk-..."
              />
            </div>
            <div>
              <FieldLabel label="Model" required />
              <input
                type="text"
                value={form.llm.model}
                onChange={(e) => updateField('llm', 'model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="gpt-4o-mini"
              />
            </div>
          </div>
        </Section>

        {/* Embedding Config */}
        <Section title="Embedding 配置" icon={Brain}>
          <div className="space-y-4">
            <div>
              <FieldLabel label="Base URL" required />
              <input
                type="text"
                value={form.embedding.baseUrl}
                onChange={(e) =>
                  updateField('embedding', 'baseUrl', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="https://api.openai.com"
              />
            </div>
            <div>
              <FieldLabel label="API Key" required />
              <input
                type="text"
                value={form.embedding.apiKey}
                onChange={(e) =>
                  updateField('embedding', 'apiKey', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="sk-..."
              />
            </div>
            <div>
              <FieldLabel label="Model" required />
              <input
                type="text"
                value={form.embedding.model}
                onChange={(e) =>
                  updateField('embedding', 'model', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="text-embedding-ada-002"
              />
            </div>
          </div>
        </Section>

        {/* Retrieval Config */}
        <Section title="检索配置" icon={Search}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Top K" required />
              <input
                type="number"
                min={1}
                value={form.retrieval.topK}
                onChange={(e) =>
                  updateField('retrieval', 'topK', parseInt(e.target.value) || 1)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <FieldLabel label="相似度阈值" required />
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.retrieval.similarityThreshold}
                onChange={(e) =>
                  updateField(
                    'retrieval',
                    'similarityThreshold',
                    parseFloat(e.target.value) || 0,
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <FieldLabel label="距离度量" required />
            <select
              value={form.retrieval.distanceMetric}
              onChange={(e) =>
                updateField(
                  'retrieval',
                  'distanceMetric',
                  e.target.value as 'cosine' | 'l2',
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="cosine">Cosine</option>
              <option value="l2">L2 (Euclidean)</option>
            </select>
          </div>
        </Section>

        {/* Chunking Config */}
        <Section title="分块配置" icon={FileText}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Chunk Size" required />
              <input
                type="number"
                min={100}
                value={form.chunking.chunkSize}
                onChange={(e) =>
                  updateField(
                    'chunking',
                    'chunkSize',
                    parseInt(e.target.value) || 100,
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <FieldLabel label="Chunk Overlap" required />
              <input
                type="number"
                min={0}
                value={form.chunking.chunkOverlap}
                onChange={(e) =>
                  updateField(
                    'chunking',
                    'chunkOverlap',
                    parseInt(e.target.value) || 0,
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
        </Section>

        {/* System Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <FieldLabel label="System Prompt" hint="可选" />
          <textarea
            value={form.systemPrompt}
            onChange={(e) =>
              updateField('systemPrompt', 'systemPrompt', e.target.value)
            }
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            placeholder="You are a helpful assistant..."
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? '创建中...' : '创建知识库'}
          </button>
        </div>
      </form>
    </div>
  );
}
