import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminProvider } from '@/context/admin-context';
import { ChatProvider } from '@/context/chat-context';
import UserChatPage from '@/pages/UserChatPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboard from '@/pages/AdminDashboard';
import KnowledgeBaseDetailPage from '@/pages/KnowledgeBaseDetail';

export default function App() {
  // 注意：不再在此处加载历史，因为历史现在按知识库 ID 隔离存储在 UserChatPage 中
  // ChatProvider 的 initialHistory 传空数组，实际历史由 UserChatPage 管理
  
  return (
    <AdminProvider>
      <ChatProvider initialHistory={[]}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<UserChatPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/knowledge-base/:id" element={<KnowledgeBaseDetailPage />} />
          </Routes>
        </BrowserRouter>
      </ChatProvider>
    </AdminProvider>
  );
}
