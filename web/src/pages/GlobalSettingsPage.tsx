import { useState, useEffect, useCallback, memo } from 'react';
import { api, GlobalConfig, LlmTestResult, EmbeddingTestResult } from '@/lib/api';
import {
  Globe,
  Brain,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  Zap,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

// ── Sub-components ──────────────────────────────────────────
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

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" />已连接
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" />连接失败
    </span>
  );
}

// ── Main component ──────────────────────────────────────────
export default function GlobalSettingsPage() {
  const [_config, setConfig] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // LLM fields
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmDropdownOpen, setLlmDropdownOpen] = useState(false);

  // Embedding fields
  const [embedBaseUrl, setEmbedBaseUrl] = useState('');
  const [embedApiKey, setEmbedApiKey] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [embedModels, setEmbedModels] = useState<string[]>([]);
  const [embedDropdownOpen, setEmbedDropdownOpen] = useState(false);

  // Test states
  const [llmTest, setLlmTest] = useState<LlmTestResult | null>(null);
  const [testingLlm, setTestingLlm] = useState(false);
  const [embedTest, setEmbedTest] = useState<EmbeddingTestResult | null>(null);
  const [testingEmbed, setTestingEmbed] = useState(false);

  // Fetch model states
  const [fetchingLlmModels, setFetchingLlmModels] = useState(false);
  const [fetchingEmbedModels, setFetchingEmbedModels] = useState(false);

  // Save states
  const [savingLlm, setSavingLlm] = useState(false);
  const [savingEmbed, setSavingEmbed] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // System prompt
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState('');

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    api.getGlobalConfig().then((cfg) => {
      setConfig(cfg);
      setLlmBaseUrl(cfg.llm_base_url);
      setLlmApiKey(cfg.llm_api_key);
      setLlmModel(cfg.llm_model);
      setEmbedBaseUrl(cfg.embedding_base_url);
      setEmbedApiKey(cfg.embedding_api_key);
      setEmbedModel(cfg.embedding_model);
      setDefaultSystemPrompt(cfg.default_system_prompt);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  // ── LLM: test connection ──────────────────────────────────
  const handleTestLlm = useCallback(async () => {
    setTestingLlm(true);
    setLlmTest(null);
    try {
      const result = await api.testLlm();
      setLlmTest(result);
    } catch (err) {
      setLlmTest({ ok: false, error: (err as Error).message });
    } finally {
      setTestingLlm(false);
    }
  }, []);

  // ── LLM: fetch models ─────────────────────────────────────
  const handleFetchLlmModels = useCallback(async () => {
    setFetchingLlmModels(true);
    try {
      const result = await api.fetchLlmModels();
      if (result.ok && result.models) {
        setLlmModels(result.models);
        setLlmDropdownOpen(true);
        showSuccess(`获取到 ${result.models.length} 个模型`);
      } else {
        setError(result.error || '获取模型列表失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetchingLlmModels(false);
    }
  }, [showSuccess]);

  // ── Embedding: test connection ────────────────────────────
  const handleTestEmbedding = useCallback(async () => {
    setTestingEmbed(true);
    setEmbedTest(null);
    try {
      const result = await api.testEmbedding();
      setEmbedTest(result);
    } catch (err) {
      setEmbedTest({ ok: false, error: (err as Error).message });
    } finally {
      setTestingEmbed(false);
    }
  }, []);

  // ── Embedding: fetch models ───────────────────────────────
  const handleFetchEmbedModels = useCallback(async () => {
    setFetchingEmbedModels(true);
    try {
      const result = await api.fetchEmbeddingModels();
      if (result.ok && result.models) {
        setEmbedModels(result.models);
        setEmbedDropdownOpen(true);
        showSuccess(`获取到 ${result.models.length} 个模型`);
      } else {
        setError(result.error || '获取模型列表失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetchingEmbedModels(false);
    }
  }, [showSuccess]);

  // ── Save handlers ─────────────────────────────────────────
  const handleSaveLlm = useCallback(async () => {
    setSavingLlm(true);
    try {
      const updated = await api.updateGlobalConfig({
        llm_base_url: llmBaseUrl.trim(),
        llm_api_key: llmApiKey.trim(),
        llm_model: llmModel.trim(),
      });
      setConfig(updated);
      showSuccess('LLM 配置已保存');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingLlm(false);
    }
  }, [llmBaseUrl, llmApiKey, llmModel, showSuccess]);

  const handleSaveEmbedding = useCallback(async () => {
    setSavingEmbed(true);
    try {
      const updated = await api.updateGlobalConfig({
        embedding_base_url: embedBaseUrl.trim(),
        embedding_api_key: embedApiKey.trim(),
        embedding_model: embedModel.trim(),
      });
      setConfig(updated);
      showSuccess('Embedding 配置已保存');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingEmbed(false);
    }
  }, [embedBaseUrl, embedApiKey, embedModel, showSuccess]);

  const handleSaveSystemPrompt = useCallback(async () => {
    setSavingPrompt(true);
    try {
      const updated = await api.updateGlobalConfig({
        default_system_prompt: defaultSystemPrompt.trim(),
      });
      setConfig(updated);
      showSuccess('System Prompt 已保存');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPrompt(false);
    }
  }, [defaultSystemPrompt, showSuccess]);

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">全局配置</h2>
      <p className="text-sm text-gray-400 mb-6">
        全局 LLM 和 Embedding 配置，所有知识库共享
      </p>

      {/* Messages */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="space-y-5">
        {/* ── LLM Config ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-indigo-500" />
              <h3 className="font-semibold text-gray-800">LLM 配置</h3>
              {llmTest && <StatusBadge ok={llmTest.ok} />}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestLlm}
                disabled={testingLlm}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <Zap className={`w-3 h-3 ${testingLlm ? 'animate-pulse' : ''}`} />
                {testingLlm ? '检测中...' : '测试连接'}
              </button>
              <button
                type="button"
                onClick={handleSaveLlm}
                disabled={savingLlm}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors"
              >
                {savingLlm ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {savingLlm ? '保存中...' : '保存'}
              </button>
            </div>
          </div>

          {/* Test result detail */}
          {llmTest && (
            <div className={`text-xs rounded-lg px-3 py-2 ${
              llmTest.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {llmTest.ok ? llmTest.message : `连接失败: ${llmTest.error}`}
              {llmTest.hint && <p className="mt-1 font-medium">💡 {llmTest.hint}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Base URL" required hint="如 https://api.openai.com" />
              <input
                type="text"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                placeholder="https://api.openai.com"
              />
            </div>
            <div>
              <FieldLabel label="API Key" required />
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                placeholder="sk-..."
              />
            </div>
          </div>

          {/* Model selector */}
          <div>
            <FieldLabel label="Model" required />
            <div className="flex gap-2">
              <div className="relative flex-1">
                {llmModels.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setLlmDropdownOpen(!llmDropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
                    >
                      <span className={llmModel ? 'text-gray-800' : 'text-gray-400'}>
                        {llmModel || '选择模型...'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    {llmDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {llmModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { setLlmModel(m); setLlmDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                              llmModel === m ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    placeholder="gpt-4o-mini"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={handleFetchLlmModels}
                disabled={fetchingLlmModels}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fetchingLlmModels ? 'animate-spin' : ''}`} />
                {fetchingLlmModels ? '获取中...' : '获取模型'}
              </button>
            </div>
            {llmModels.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">已加载 {llmModels.length} 个可用模型，点击下拉选择</p>
            )}
          </div>
        </div>

        {/* ── Embedding Config ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-indigo-500" />
              <h3 className="font-semibold text-gray-800">Embedding 配置</h3>
              {embedTest && <StatusBadge ok={embedTest.ok} />}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestEmbedding}
                disabled={testingEmbed}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <Zap className={`w-3 h-3 ${testingEmbed ? 'animate-pulse' : ''}`} />
                {testingEmbed ? '检测中...' : '测试连接'}
              </button>
              <button
                type="button"
                onClick={handleSaveEmbedding}
                disabled={savingEmbed}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors"
              >
                {savingEmbed ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {savingEmbed ? '保存中...' : '保存'}
              </button>
            </div>
          </div>

          {/* Embedding test result detail */}
          {embedTest && (
            <div className={`text-xs rounded-lg px-3 py-2 ${
              embedTest.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {embedTest.ok
                ? `${embedTest.message}`
                : `连接失败: ${embedTest.error}`}
              {embedTest.hint && <p className="mt-1 font-medium">💡 {embedTest.hint}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Base URL" required />
              <input
                type="text"
                value={embedBaseUrl}
                onChange={(e) => setEmbedBaseUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                placeholder="https://api.openai.com"
              />
            </div>
            <div>
              <FieldLabel label="API Key" required />
              <input
                type="password"
                value={embedApiKey}
                onChange={(e) => setEmbedApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                placeholder="sk-..."
              />
            </div>
          </div>

          {/* Embedding model selector */}
          <div>
            <FieldLabel label="Model" required />
            <div className="flex gap-2">
              <div className="relative flex-1">
                {embedModels.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEmbedDropdownOpen(!embedDropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
                    >
                      <span className={embedModel ? 'text-gray-800' : 'text-gray-400'}>
                        {embedModel || '选择模型...'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    {embedDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {embedModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { setEmbedModel(m); setEmbedDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                              embedModel === m ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={embedModel}
                    onChange={(e) => setEmbedModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    placeholder="text-embedding-ada-002"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={handleFetchEmbedModels}
                disabled={fetchingEmbedModels}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fetchingEmbedModels ? 'animate-spin' : ''}`} />
                {fetchingEmbedModels ? '获取中...' : '获取模型'}
              </button>
            </div>
            {embedModels.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">已加载 {embedModels.length} 个可用模型，点击下拉选择</p>
            )}
          </div>
        </div>

        {/* ── System Prompt ───────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-500" />
              <h3 className="font-semibold text-gray-800">默认 System Prompt</h3>
            </div>
            <button
              onClick={handleSaveSystemPrompt}
              disabled={savingPrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors"
            >
              {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {savingPrompt ? '保存中...' : '保存'}
            </button>
          </div>
          <textarea
            value={defaultSystemPrompt}
            onChange={(e) => setDefaultSystemPrompt(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-sm"
            placeholder="输入默认 System Prompt..."
          />
          <p className="text-xs text-gray-400">
            新建知识库时，System Prompt 默认使用此配置。每个知识库可在详情页单独覆盖。
          </p>
        </div>
      </div>
    </div>
  );
}
