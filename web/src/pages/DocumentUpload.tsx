import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Upload, FileText, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react';

interface DocumentItem {
  id: string;
  filename: string;
  status: 'pending' | 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'storing' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface Props {
  kbId: string;
  kbName: string;
}

export default function DocumentUpload({ kbId, kbName }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = {
    total: documents.length,
    done: documents.filter((d) => d.status === 'done').length,
    error: documents.filter((d) => d.status === 'error').length,
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !kbId) return;

      const mdFiles = Array.from(files).filter((f) => f.name.endsWith('.md'));
      if (mdFiles.length === 0) return;

      setUploading(true);

      // Add pending documents
      const newDocs: DocumentItem[] = mdFiles.map((f) => ({
        id: Math.random().toString(36).substring(2),
        filename: f.name,
        status: 'uploading',
        progress: 0,
      }));

      setDocuments((prev) => [...prev, ...newDocs]);

      try {
        const result = await api.uploadDocuments(kbId, mdFiles);

        // Update document statuses based on result
        if (result.documents) {
          setDocuments((prev) =>
            prev.map((doc) => {
              const match = result.documents?.find(
                (r: { filename: string; status: string }) => r.filename === doc.filename,
              );
              if (match) {
                if (match.status === 'success') {
                  return { ...doc, status: 'done', progress: 100 };
                }
                if (match.status === 'error') {
                  return { ...doc, status: 'error', progress: 0, error: match.error };
                }
              }
              return { ...doc, status: 'done', progress: 100 };
            }),
          );
        }
      } catch {
        setDocuments((prev) =>
          prev.map((doc) => {
            if (newDocs.find((n) => n.id === doc.id)) {
              return { ...doc, status: 'error', error: '上传失败' };
            }
            return doc;
          }),
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [kbId],
  );

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const statusConfig = {
    pending: { label: '等待中', color: 'bg-gray-100 text-gray-600' },
    uploading: { label: '上传中', color: 'bg-blue-100 text-blue-600' },
    parsing: { label: '解析中', color: 'bg-purple-100 text-purple-600' },
    chunking: { label: '分块中', color: 'bg-yellow-100 text-yellow-600' },
    embedding: { label: '嵌入中', color: 'bg-orange-100 text-orange-600' },
    storing: { label: '存储中', color: 'bg-indigo-100 text-indigo-600' },
    done: { label: '已完成', color: 'bg-green-100 text-green-600' },
    error: { label: '失败', color: 'bg-red-100 text-red-600' },
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        文档上传
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        知识库: {kbName}
      </p>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="flex items-center gap-4 mb-4">
          <div className="text-sm text-gray-600">
            总计: <span className="font-medium">{stats.total}</span>
          </div>
          <div className="text-sm text-green-600">
            成功: <span className="font-medium">{stats.done}</span>
          </div>
          <div className="text-sm text-red-600">
            失败: <span className="font-medium">{stats.error}</span>
          </div>
        </div>
      )}

      {/* File Upload */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          uploading
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer'
        }`}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p>上传中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload className="w-8 h-8" />
            <p className="font-medium">点击或拖拽上传 Markdown 文件</p>
            <p className="text-xs text-gray-400">支持 .md 文件</p>
          </div>
        )}
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <div className="mt-4 space-y-2">
          {documents.map((doc) => {
            const config = statusConfig[doc.status];
            return (
              <div
                key={doc.id}
                className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4"
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {doc.status === 'done' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : doc.status === 'error' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <FileText className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {doc.filename}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${config.color} flex-shrink-0`}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  {doc.status !== 'done' && doc.status !== 'error' && (
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${doc.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error Message */}
                  {doc.error && (
                    <p className="text-xs text-red-500 mt-1">{doc.error}</p>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
