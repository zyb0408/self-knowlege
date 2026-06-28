import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, KnowledgeBaseDetail as KBDetail } from '@/lib/api';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Upload,
  File,
  X,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Search,
  FileText,
} from 'lucide-react';

// Extracted outside component for stable reference across renders
const FieldLabel = memo(function FieldLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {hint && <span className="text-gray-400 ml-1 text-xs">{hint}</span>}
    </label>
  );
});

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: '待上传', color: 'bg-gray-100 text-gray-600', icon: File },
  indexing: { label: '索引中', color: 'bg-yellow-100 text-yellow-600', icon: Loader2 },
  done: { label: '已完成', color: 'bg-green-100 text-green-600', icon: CheckCircle },
  error: { label: '失败', color: 'bg-red-100 text-red-600', icon: XCircle },
  skipped: { label: '已跳过', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

export default function KnowledgeBaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [kb, setKb] = useState<KBDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editTopK, setEditTopK] = useState(5);
  const [editThreshold, setEditThreshold] = useState(0.5);
  const [editDistanceMetric, setEditDistanceMetric] = useState('cosine');
  const [editChunkSize, setEditChunkSize] = useState(500);
  const [editChunkOverlap, setEditChunkOverlap] = useState(50);
  const [editSystemPrompt, setEditSystemPrompt] = useState('');

  const loadKb = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getKnowledgeBase(id);
      setKb(data);
      setEditName(data.name);
      setEditTopK(data.top_k);
      setEditThreshold(data.similarity_threshold);
      setEditDistanceMetric(data.distance_metric);
      setEditChunkSize(data.chunk_size);
      setEditChunkOverlap(data.chunk_overlap);
      setEditSystemPrompt(data.system_prompt || '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadKb();
  }, [loadKb]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.updateKnowledgeBase(id, {
        name: editName.trim(),
        top_k: editTopK,
        similarity_threshold: editThreshold,
        distance_metric: editDistanceMetric,
        chunk_size: editChunkSize,
        chunk_overlap: editChunkOverlap,
        system_prompt: editSystemPrompt.trim() || undefined,
      });
      setKb(updated);
      setSuccessMsg('配置已保存');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [id, editName, editTopK, editThreshold, editDistanceMetric, editChunkSize, editChunkOverlap, editSystemPrompt]);

  const handleReindex = useCallback(async () => {
    if (!id) return;
    if (!confirm('重新索引将清除当前所有向量数据，文档状态将重置为待上传。确定继续？')) return;
    setReindexing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await api.reindexKnowledgeBase(id);
      setSuccessMsg(`重新索引完成：${result.results.length} 个文档需要重新上传`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await loadKb();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReindexing(false);
    }
  }, [id, loadKb]);

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

  const removeAttachedFile = useCallback((name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const handleUpload = useCallback(async () => {
    if (!id || attachedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await api.uploadDocuments(id, attachedFiles);
      setAttachedFiles([]);
      const doneCount = result.results?.filter(
        (r: { status: string }) => r.status === 'done',
      ).length || 0;
      setSuccessMsg(`上传完成：${doneCount} 个文件已索引`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await loadKb();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [id, attachedFiles, loadKb]);

  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      if (!id) return;
      if (!confirm('确定删除此文档？')) return;
      try {
        await api.deleteDocument(id, docId);
        await loadKb();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [id, loadKb],
  );

  const handleDeleteKb = useCallback(async () => {
    if (!id) return;
    if (!confirm(`确定删除知识库「${kb?.name}」及其所有文档？此操作不可撤销！`)) return;
    try {
      await api.deleteKnowledgeBase(id);
      navigate('/admin/dashboard');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, kb, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">知识库不存在</p>
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="text-indigo-600 hover:text-indigo-700 text-sm mt-2"
        >
          返回列表
        </button>
      </div>
    );
  }

  const documents = kb.documents || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-800">{kb.name}</h2>
            <p className="text-sm text-gray-400">
              创建于 {new Date(kb.created_at).toLocaleDateString('zh-CN')}
            </p>
          </div>
        </div>
        <button
          onClick={handleDeleteKb}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          删除知识库
        </button>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg px-4 py-3 mb-4">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column — Config */}
        <div className="space-y-5">
          {/* Name */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <FieldLabel label="知识库名称" />
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Retrieval Config */}
          <div className="bg-gray-50 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Search className="w-4 h-4 text-indigo-500" />
              <h3 className="font-medium text-gray-800">检索配置</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Top K" />
                <input
                  type="number"
                  min={1}
                  value={editTopK}
                  onChange={(e) => setEditTopK(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <FieldLabel label="相似度阈值" />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <div>
              <FieldLabel label="距离度量" />
              <select
                value={editDistanceMetric}
                onChange={(e) => setEditDistanceMetric(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="cosine">Cosine</option>
                <option value="l2">L2 (Euclidean)</option>
              </select>
            </div>
          </div>

          {/* Chunking Config */}
          <div className="bg-gray-50 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-indigo-500" />
              <h3 className="font-medium text-gray-800">分块配置</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Chunk Size" />
                <input
                  type="number"
                  min={100}
                  value={editChunkSize}
                  onChange={(e) => setEditChunkSize(Math.max(100, Number(e.target.value) || 100))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <FieldLabel label="Chunk Overlap" />
                <input
                  type="number"
                  min={0}
                  value={editChunkOverlap}
                  onChange={(e) => setEditChunkOverlap(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <FieldLabel label="System Prompt" hint="留空使用全局默认" />
            <textarea
              value={editSystemPrompt}
              onChange={(e) => setEditSystemPrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              placeholder="使用全局默认 System Prompt..."
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? '保存中...' : '保存配置'}
            </button>
            <button
              onClick={handleReindex}
              disabled={reindexing}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              {reindexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {reindexing ? '索引中...' : '重新索引'}
            </button>
          </div>
        </div>

        {/* Right Column — Documents */}
        <div className="space-y-5">
          {/* Upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-500" />
              上传文档
            </h3>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                uploading
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50'
              }`}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">点击选择 Markdown 文件</p>
              <p className="text-xs text-gray-400 mt-1">使用当前分块和 Embedding 配置进行索引</p>
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
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(file.name)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      上传并索引中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      上传并索引 {attachedFiles.length} 个文件
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Document List */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
              <File className="w-4 h-4 text-indigo-500" />
              文档列表
              <span className="text-xs text-gray-400 font-normal ml-1">
                ({documents.length} 个)
              </span>
            </h3>

            {documents.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <File className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无文档</p>
                <p className="text-xs mt-1">上传 .md 文件开始构建知识库</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {documents.map((doc) => {
                  const config = statusConfig[doc.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5"
                    >
                      <StatusIcon className={`w-4 h-4 flex-shrink-0 ${
                        doc.status === 'done' ? 'text-green-500' :
                        doc.status === 'error' ? 'text-red-500' :
                        doc.status === 'indexing' ? 'text-yellow-500 animate-spin' :
                        'text-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 truncate">{doc.filename}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${config.color}`}>
                            {config.label}
                          </span>
                        </div>
                        {doc.chunk_count > 0 && (
                          <span className="text-xs text-gray-400">
                            {doc.chunk_count} 个分块
                          </span>
                        )}
                        {doc.error && (
                          <p className="text-xs text-red-500 mt-0.5 truncate">{doc.error}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 flex-shrink-0"
                        title="删除文档"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
