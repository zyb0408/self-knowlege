import { useState, useCallback, KeyboardEvent } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSubmit, disabled }: Props) {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
  }, [text, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex items-end gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息..."
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none outline-none text-sm text-gray-800 placeholder-gray-400 disabled:opacity-50 max-h-32"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="flex-shrink-0 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white rounded-lg transition-colors"
        title="发送"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.517 60.517 0 0 0 17.832 5.989.75.75 0 0 0 .711-.962l-2.432-7.905h9.516a.75.75 0 0 1 0-1.5H5.484l2.432-7.905a.75.75 0 0 0-.926-.94A60.517 60.517 0 0 0 3.478 2.405Z" />
        </svg>
      </button>
    </div>
  );
}
