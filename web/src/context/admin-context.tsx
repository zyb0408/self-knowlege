import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';

interface AdminContextType {
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const session = await api.checkSession();
        setAuthenticated((session as { authenticated: boolean }).authenticated);
      } catch {
        setAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  const login = useCallback(
    async (password: string) => {
      setError(null);
      try {
        await api.login(password);
        setAuthenticated(true);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    setAuthenticated(false);
  }, []);

  return (
    <AdminContext.Provider
      value={{ authenticated, loading, error, login, logout }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider');
  }
  return context;
}
