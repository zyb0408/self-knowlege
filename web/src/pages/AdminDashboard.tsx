import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '@/context/admin-context';
import { api, KnowledgeBase } from '@/lib/api';
import KnowledgeBaseForm from './KnowledgeBaseForm';
import RetrievalDebugger from './RetrievalDebugger';
import {
  LogOut,
  BookOpen,
  Plus,
  Search,
  Database,
  BarChart3,
  ChevronRight,
} from 'lucide-react';

type TabId = 'list' | 'create' | 'debug';

export default function AdminDashboard() {
  const { authenticated, loading: authLoading, logout } = useAdmin();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('list');
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !authenticated) {
      navigate('/admin/login', { replace: true });
    }
  }, [authenticated, authLoading, navigate]);

  const fetchKbs = useCallback(async () => {
    try {
      const data = await api.getKnowledgeBases();
      setKbs(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKbs();
  }, [fetchKbs]);

  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      if (tab === 'list') {
        fetchKbs();
      }
    },
    [fetchKbs],
  );

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const tabs = [
    { id: 'list' as TabId, label: '知识库列表', icon: Database },
    { id: 'create' as TabId, label: '创建知识库', icon: Plus },
    { id: 'debug' as TabId, label: '检索调试', icon: Search },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="font-semibold text-gray-800">管理后台</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="px-2 py-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {activeTab === 'list' && (
            <KnowledgeBaseListView
              kbs={kbs}
              loading={loading}
              onRefresh={fetchKbs}
              onSelect={(id) => navigate(`/admin/knowledge-base/${id}`)}
            />
          )}
          {activeTab === 'create' && <KnowledgeBaseForm />}
          {activeTab === 'debug' && <RetrievalDebugger />}
        </div>
      </main>
    </div>
  );
}

function KnowledgeBaseListView({
  kbs,
  loading,
  onRefresh,
  onSelect,
}: {
  kbs: KnowledgeBase[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">知识库列表</h2>
        <button
          onClick={onRefresh}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : kbs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">暂无知识库</p>
          <p className="text-sm text-gray-400 mt-1">
            前往"创建知识库"添加第一个知识库
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {kbs.map((kb) => (
            <div
              key={kb.id}
              onClick={() => onSelect(kb.id)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-800 group-hover:text-indigo-700 transition-colors">
                      {kb.name}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      {kb.documentCount} 文档
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      {kb.totalChunks} 分块
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-3.5 h-3.5" />
                      {new Date(kb.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
