import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminProvider } from '@/context/admin-context';
import { ChatProvider } from '@/context/chat-context';
import { useLocalStorage } from '@/hooks/use-local-storage';
import UserChatPage from '@/pages/UserChatPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboard from '@/pages/AdminDashboard';

export default function App() {
  const [history] = useLocalStorage<any[]>('chat-history', []);

  return (
    <AdminProvider>
      <ChatProvider initialHistory={history}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<UserChatPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Routes>
        </BrowserRouter>
      </ChatProvider>
    </AdminProvider>
  );
}
