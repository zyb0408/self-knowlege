import { useState, useCallback, useEffect, useRef } from 'react';
import { api, GlobalConfig } from '@/lib/api';
import {
  Save,
  Globe,
  Brain,
  Search,
  FileText,
  X,
  AlertCircle,
  Upload,
  File,
  RefreshCw,
  Loader2,
} from 'lucide-react';

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

const defaultRetrieval = { topK: 5, similarityThreshold: 0.7, distanceMetric: 'cosine' as const };
const defaultChunking = { chunkSize: 500, chunkOverlap: 50 };

function makeDefaultForm(global?: GlobalConfig | null): FormValues {
  return {
    name: '',
    llm: {
      baseUrl: global?.llm_base_url || '',
      apiKey: global?.llm_api_key || '',
      model: global?.llm_model || '',
    },
    embedding: {
      baseUrl: global?.embedding_base_url || '',
      apiKey: global?.embedding_api_key || '',
      model: global?.embedding_model || '',
    },
    retrieval: { ...defaultRetrieval },
    chunking: { ...defaultChunking },
    systemPrompt: global?.default_system_prompt || '',
  };
}

export default function KnowledgeBaseForm() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [form, setForm] = useState<FormValues>(makeDefaultForm());
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load global config on mount
  useEffect(() => {
    api
      .getGlobalConfig()
      .then((cfg) => {
        setGlobalConfig(cfg);
        setForm(makeDefaultForm(cfg));
      })
      .catch(() => {
        // Use empty defaults if config load fails
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
    if (!form.llm.baseUrl.trim()) missing.push('LLM Base URL');
    if (!form.llm.apiKey.trim()) missing.push('LLM API Key');
    if (!form.llm.model.trim()) missing.push('LLM Model');
    if (!form.embedding.baseUrl.trim()) missing.push('Embedding Base URL');
    if (!form.embedding.apiKey.trim()) missing.push('Embedding API Key');
    if (!form.embedding.model.trim()) missing.push('Embedding Model');
    return missing;
  }, [form]);

  // Save global config
  const handleSaveGlobalConfig = useCallback(async () => {
    setSavingGlobal(true);
    try {
      const updated = await api.updateGlobalConfig({
        llm_base_url: form.llm.baseUrl.trim(),
        llm_api_key: form.llm.apiKey.trim(),
        llm_model: form.llm.model.trim(),
        embedding_base_url: form.embedding.baseUrl.trim(),
        embedding_api_key: form.embedding.apiKey.trim(),
        embedding_model: form.embedding.model.trim(),
      });
      setGlobalConfig(updated);
    } catch (err) {
      setError((err as Error).message);
      setShowErrorModal(true);
    } finally {
      setSavingGlobal(false);
    }
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
        // Save global config first
        await api.updateGlobalConfig({
          llm_base_url: form.llm.baseUrl.trim(),
          llm_api_key: form.llm.apiKey.trim(),
          llm_model: form.llm.model.trim(),
          embedding_base_url: form.embedding.baseUrl.trim(),
          embedding_api_key: form.embedding.apiKey.trim(),
          embedding_model: form.embedding.model.trim(),
        });

        // Create KB with files if any
        const kbData = {
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
        setForm(makeDefaultForm(globalConfig));
        setAttachedFiles([]);
      } catch (err) {
        setError((err as Error).message);
        setShowErrorModal(true);
      } finally {
        setSaving(false);
      }
    },
    [form, validate, attachedFiles, globalConfig],
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
    action,
  }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    action?: React.ReactNode;
  }) => (
    <div className="bg-gray-50 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-indigo-500" />
          <h3 className="font-medium text-gray-800">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );

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

      <form onSubmit={handleSubmit} className="space-y-5">
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg px-4 py-3">
            知识库创建成功！{attachedFiles.length > 0 && '文件正在后台索引中...'}
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

        {/* LLM Config — 全局配置 */}
        <Section
          title="LLM 配置（全局）"
          icon={Globe}
          action={
            <button
              type="button"
              onClick={handleSaveGlobalConfig}
              disabled={savingGlobal}
              className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${savingGlobal ? 'animate-spin' : ''}`} />
              保存全局配置
            </button>
          }
        >
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
                type="password"
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

        {/* Embedding Config — 全局配置 */}
        <Section
          title="Embedding 配置（全局）"
          icon={Brain}
          action={
            <button
              type="button"
              onClick={handleSaveGlobalConfig}
              disabled={savingGlobal}
              className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${savingGlobal ? 'animate-spin' : ''}`} />
              保存全局配置
            </button>
          }
        >
          <div className="space-y-4">
            <div>
              <FieldLabel label="Base URL" required />
              <input
                type="text"
                value={form.embedding.baseUrl}
                onChange={(e) => updateField('embedding', 'baseUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="https://api.openai.com"
              />
            </div>
            <div>
              <FieldLabel label="API Key" required />
              <input
                type="password"
                value={form.embedding.apiKey}
                onChange={(e) => updateField('embedding', 'apiKey', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="sk-..."
              />
            </div>
            <div>
              <FieldLabel label="Model" required />
              <input
                type="text"
                value={form.embedding.model}
                onChange={(e) => updateField('embedding', 'model', e.target.value)}
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
        </Section>

        {/* System Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <FieldLabel label="System Prompt" hint="可选，默认使用全局配置" />
          <textarea
            value={form.systemPrompt}
            onChange={(e) => updateField('systemPrompt', 'systemPrompt', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            placeholder={globalConfig?.default_system_prompt || 'You are a helpful assistant...'}
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

          {/* Attached Files List */}
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
