import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { api, GlobalConfig } from '@/lib/api';
import {
  Save,
  Search,
  FileText,
  X,
  AlertCircle,
  Upload,
  File,
  Loader2,
  Settings,
} from 'lucide-react';

interface FormValues {
  name: string;
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

const defaultRetrieval = { topK: 5, similarityThreshold: 0.7, distanceMetric: 'cosine' as const };
const defaultChunking = { chunkSize: 500, chunkOverlap: 50 };

function makeDefaultForm(defaultSystemPrompt?: string): FormValues {
  return {
    name: '',
    retrieval: { ...defaultRetrieval },
    chunking: { ...defaultChunking },
    systemPrompt: defaultSystemPrompt || '',
  };
}

// Extracted outside component to keep stable references across renders
const FieldLabel = memo(function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {hint && <span className="text-gray-400 ml-1 text-xs">{hint}</span>}
    </label>
  );
});

const FormSection = memo(function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-indigo-500" />
        <h3 className="font-medium text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  );
});

export default function KnowledgeBaseForm() {
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState('');
  const [configLoading, setConfigLoading] = useState(true);
  const [form, setForm] = useState<FormValues>(makeDefaultForm());
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load default system prompt from global config
  useEffect(() => {
    api
      .getGlobalConfig()
      .then((cfg: GlobalConfig) => {
        setDefaultSystemPrompt(cfg.default_system_prompt || '');
        setForm((prev) => ({
          ...prev,
          systemPrompt: cfg.default_system_prompt || '',
        }));
      })
      .catch(() => {
        // Use empty defaults
      })
      .finally(() => setConfigLoading(false));
  }, []);

  const updateField = useCallback(
    (section: keyof FormValues, field: string, value: string | number) => {
      setForm((prev) => ({
        ...prev,
        [section]:
          typeof prev[section] === 'object' && prev[section] !== null
            ? { ...(prev[section] as Record<string, unknown>), [field]: value }
            : value,
      }));
    },
    [],
  );

  const validate = useCallback((): string[] => {
    const missing: string[] = [];
    if (!form.name.trim()) missing.push('知识库名称');
    return missing;
  }, [form]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      setSuccess(false);

      const missing = validate();
      if (missing.length > 0) {
        setShowErrorModal(true);
        setSaving(false);
        return;
      }

      try {
        const kbData: Record<string, string | number> = {
          name: form.name.trim(),
          top_k: form.retrieval.topK,
          similarity_threshold: form.retrieval.similarityThreshold,
          distance_metric: form.retrieval.distanceMetric,
          chunk_size: form.chunking.chunkSize,
          chunk_overlap: form.chunking.chunkOverlap,
          system_prompt: form.systemPrompt.trim(),
        };

        if (attachedFiles.length > 0) {
          await api.createKnowledgeBaseWithFiles(kbData, attachedFiles);
        } else {
          await api.createKnowledgeBase(kbData);
        }

        setSuccess(true);
        setForm(makeDefaultForm(defaultSystemPrompt));
        setAttachedFiles([]);
      } catch (err) {
        setError((err as Error).message);
        setShowErrorModal(true);
      } finally {
        setSaving(false);
      }
    },
    [form, validate, attachedFiles, defaultSystemPrompt],
  );

  const handleNumberChange = useCallback(
    (section: keyof FormValues, field: string, min: number) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === '' || raw === '-') {
          setForm((prev) => ({
            ...prev,
            [section]: {
              ...(prev[section] as object),
              [field]: min,
            },
          }));
          return;
        }
        const num = parseFloat(raw);
        const value = isNaN(num) ? min : Math.max(min, num);
        updateField(section, field, value);
      },
    [updateField],
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const mdFiles = Array.from(files).filter((f) => f.name.endsWith('.md'));
    setAttachedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const newFiles = mdFiles.filter((f) => !existing.has(f.name));
      return [...prev, ...newFiles];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">创建知识库</h2>

      {/* Global config hint */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 mb-5 flex items-center gap-2 text-sm text-indigo-700">
        <Settings className="w-4 h-4 flex-shrink-0" />
        <span>
          LLM 和 Embedding 使用全局配置，可在侧边栏「全局配置」中管理
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg px-4 py-3">
            知识库创建成功！{attachedFiles.length > 0 && '文件已提交索引...'}
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

        {/* Retrieval Config */}
        <FormSection title="检索配置" icon={Search}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Top K" required />
              <input
                type="number"
                min={1}
                value={form.retrieval.topK}
                onChange={handleNumberChange('retrieval', 'topK', 1)}
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
                onChange={handleNumberChange('retrieval', 'similarityThreshold', 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <FieldLabel label="距离度量" required />
            <select
              value={form.retrieval.distanceMetric}
              onChange={(e) =>
                updateField('retrieval', 'distanceMetric', e.target.value as 'cosine' | 'l2')
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="cosine">Cosine</option>
              <option value="l2">L2 (Euclidean)</option>
            </select>
          </div>
        </FormSection>

        {/* Chunking Config */}
        <FormSection title="分块配置" icon={FileText}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Chunk Size" required />
              <input
                type="number"
                min={100}
                value={form.chunking.chunkSize}
                onChange={handleNumberChange('chunking', 'chunkSize', 100)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <FieldLabel label="Chunk Overlap" required />
              <input
                type="number"
                min={0}
                value={form.chunking.chunkOverlap}
                onChange={handleNumberChange('chunking', 'chunkOverlap', 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
        </FormSection>

        {/* System Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <FieldLabel label="System Prompt" hint="可选，默认为全局配置" />
          <textarea
            value={form.systemPrompt}
            onChange={(e) => updateField('systemPrompt', 'systemPrompt', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            placeholder={defaultSystemPrompt || 'You are a helpful assistant...'}
          />
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <FieldLabel label="上传文档" hint="支持 .md 文件，可在创建时一并上传" />
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              saving
                ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50'
            }`}
            onClick={() => !saving && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md"
              className="hidden"
              onChange={handleFileSelect}
              disabled={saving}
            />
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">点击选择 Markdown 文件</p>
            <p className="text-xs text-gray-400 mt-1">支持 .md 文件，可多选</p>
          </div>

          {attachedFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachedFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
                >
                  <File className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.name)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                创建知识库
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                {error ? '请求失败' : '提交失败'}
              </h3>
              <button
                onClick={() => setShowErrorModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              {error ? (
                <p className="text-sm text-gray-600">{error}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 mb-3">以下必填项尚未填写：</p>
                  <ul className="space-y-1.5">
                    {validate().map((field) => (
                      <li key={field} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                        {field}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
