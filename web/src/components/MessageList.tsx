import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Message } from '@/context/chat-context';
import { User, Bot, Loader2 } from 'lucide-react';

interface Props {
  messages: Message[];
  isStreaming: boolean;
}

export default function MessageList({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, index) => (
        <div
          key={index}
          className={`flex items-start gap-3 ${
            msg.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          {/* Avatar */}
          {msg.role === 'assistant' && (
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
          )}

          {/* Message Bubble */}
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-md'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
            }`}
          >
            {msg.role === 'assistant' ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            )}
          </div>

          {/* User Avatar */}
          {msg.role === 'user' && (
            <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
          )}
        </div>
      ))}

      {/* Loading Indicator */}
      {isStreaming && (
        <div className="flex items-start gap-3 justify-start">
          <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <Bot className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
              <span className="text-sm text-gray-500">...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
