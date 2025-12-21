import React, { useState, useEffect } from 'react';
import { Plus, ArrowUp } from 'lucide-react';
import type { ChatMessage } from './types';

interface ChatPanelProps {
  chatMessage: string;
  setChatMessage: (message: string) => void;
  chatHistory: ChatMessage[];
  chatHistoryRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSendMessage: () => void;
  handleToneSelect: (tone: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chatMessage,
  setChatMessage,
  chatHistory,
  chatHistoryRef,
  textareaRef,
  handleSendMessage,
  handleToneSelect,
}) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="w-[300px] h-full bg-white/80 backdrop-blur-lg p-6 shadow-lg flex flex-col">
      <div ref={chatHistoryRef} className="flex-grow overflow-y-auto space-y-6 pr-4 pb-4">
        <h2 className="text-lg font-semibold mb-4">MICRAi</h2>
        
        {chatHistory.map((chat, index) => (
          <div key={index} className={`flex mb-4 ${chat.user === 'You' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex-1">
              {chat.user === 'You' ? (
                <div className="bg-[#F4F4F6] text-[#1d1d1f] p-3 rounded-lg">
                  <p className="text-sm">{chat.text}</p>
                </div>
              ) : chat.isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              ) : (
                <>
                  <p className="text-sm mb-3">{chat.text}</p>
                  {chat.showToneOptions && (
                    <div className="mt-3 space-y-2">
                      {['Professional', 'Friendly', 'Concise', 'Persuasive'].map((tone) => (
                        <button
                          key={tone}
                          onClick={() => handleToneSelect(tone)}
                          className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-800 transition-colors border border-gray-200 hover:border-gray-300"
                        >
                          <div className="flex items-center">
                            <div className="w-4 h-4 rounded-full border-2 border-gray-400 mr-3"></div>
                            <span className="font-medium">{tone}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {!chat.isLoading && (
                <p className={`text-xs text-gray-400 mt-1 ${chat.user === 'You' ? 'text-right' : ''}`}>{chat.user}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {isClient && (
        <div className="mt-4 p-2 border rounded-lg bg-white/80 shadow-sm chat-input-container">
          <textarea
            ref={textareaRef}
            placeholder="Start with an idea or task."
            className="w-full bg-transparent focus:outline-none resize-none text-sm text-black placeholder-gray-500 max-h-40 overflow-y-auto"
            value={chatMessage}
            onChange={(e) => {
              setChatMessage(e.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${e.target.scrollHeight}px`;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            rows={1}
          />
          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center space-x-2 text-gray-500">
              <Plus size={20} className="cursor-pointer hover:text-gray-800" />
            </div>
            <button
              className="bg-gray-200 text-gray-600 w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
              onClick={() => handleSendMessage()}
              disabled={!chatMessage.trim()}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

