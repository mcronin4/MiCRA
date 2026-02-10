import React, { useState, useEffect } from "react";
import {
  Plus,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from "lucide-react";
import type { ChatMessage } from "./types";

interface ChatPanelProps {
  chatMessage: string;
  setChatMessage: (message: string) => void;
  chatHistory: ChatMessage[];
  chatHistoryRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSendMessage: () => void;
  handleToneSelect: (tone: string) => void;
  onClose?: () => void;
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
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const hasHistory = chatHistory.length > 0;

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 overflow-hidden transition-all duration-300 ease-out z-50 ${
        isExpanded && hasHistory ? "w-[520px]" : "w-[520px]"
      }`}
    >
      {/* Main Container */}
      <div className="relative rounded-2xl bg-white border border-gray-200">
        {/* Collapse/Expand Header - only show when there's history */}
        {hasHistory && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-black/[0.02] transition-colors border-b border-gray-100/50"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                <MessageCircle size={14} className="text-gray-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">MICRAi</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {chatHistory.length} messages
              </span>
            </div>
            <div className="text-gray-400 hover:text-gray-600 transition-colors">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </button>
        )}

        {/* Chat History - Collapsible */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            isExpanded && hasHistory
              ? "max-h-[280px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div
            ref={chatHistoryRef}
            className="overflow-y-auto p-4 space-y-3 max-h-[280px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
          >
            {chatHistory.map((chat, index) => (
              <div
                key={index}
                className={`flex ${chat.user === "You" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%]`}>
                  {chat.user === "You" ? (
                    <div className="bg-gradient-to-r from-gray-100 to-gray-50 text-gray-800 px-4 py-2.5 rounded-2xl rounded-br-sm text-sm shadow-sm">
                      {chat.text}
                    </div>
                  ) : chat.isLoading ? (
                    <div className="flex items-center gap-1 py-2 px-1">
                      <div
                        className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {chat.text}
                      </p>
                      {chat.showToneOptions && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[
                            "Professional",
                            "Friendly",
                            "Concise",
                            "Persuasive",
                          ].map((tone) => (
                            <button
                              key={tone}
                              onClick={() => handleToneSelect(tone)}
                              className="px-3 py-1.5 bg-white hover:bg-violet-50 rounded-full text-xs font-medium text-gray-600 hover:text-violet-600 transition-all border border-gray-200 hover:border-violet-200 shadow-sm"
                            >
                              {tone}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Area */}
        {isClient && (
          <div
            className={`p-3 ${hasHistory && isExpanded ? "border-t border-gray-100/50" : ""}`}
          >
            <div className="flex items-center gap-3 bg-white/50 rounded-xl px-3 py-2 border border-gray-100 focus-within:border-violet-200 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
              <button className="text-gray-300 hover:text-violet-500 transition-colors p-0.5 rounded-lg hover:bg-violet-50">
                <Plus size={18} strokeWidth={2} />
              </button>
              <input
                ref={
                  textareaRef as unknown as React.RefObject<HTMLInputElement>
                }
                type="text"
                placeholder="Ask MICRAi anything..."
                className="flex-1 bg-transparent focus:outline-none text-sm text-gray-800 placeholder-gray-400"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center hover:from-violet-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                onClick={() => handleSendMessage()}
                disabled={!chatMessage.trim()}
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
