import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  retrievalResults?: any[];
}

export interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'STREAM_CHUNK'; payload: string }
  | { type: 'SET_STREAMING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'LOAD_HISTORY'; payload: Message[] };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload], error: null };
    case 'STREAM_CHUNK': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + action.payload };
      } else {
        msgs.push({ role: 'assistant', content: action.payload, timestamp: Date.now() });
      }
      return { ...state, messages: msgs };
    }
    case 'SET_STREAMING':
      return { ...state, isStreaming: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_HISTORY':
      return { messages: [], isStreaming: false, error: null };
    case 'LOAD_HISTORY':
      return { ...state, messages: action.payload, isStreaming: false, error: null };
    default:
      return state;
  }
}

interface ChatContextType {
  state: ChatState;
  sendMessage: (content: string) => void;
  clearHistory: () => void;
  setStreaming: (streaming: boolean) => void;
  appendStream: (chunk: string) => void;
  setError: (error: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  initialHistory,
}: {
  children: ReactNode;
  initialHistory: Message[];
}) {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: initialHistory,
    isStreaming: false,
    error: null,
  });

  const sendMessage = useCallback(
    (content: string) => {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { role: 'user', content, timestamp: Date.now() },
      });
    },
    [],
  );

  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_HISTORY' });
  }, []);

  const setStreaming = useCallback((streaming: boolean) => {
    dispatch({ type: 'SET_STREAMING', payload: streaming });
  }, []);

  const appendStream = useCallback((chunk: string) => {
    dispatch({ type: 'STREAM_CHUNK', payload: chunk });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  return (
    <ChatContext.Provider
      value={{ state, sendMessage, clearHistory, setStreaming, appendStream, setError }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
}
