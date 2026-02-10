import React from 'react';
import { MessageCircle, Send, Share2, MoreHorizontal, ThumbsUp } from 'lucide-react';

interface LinkedInNodeData {
  content?: string;
  label?: string;
}

export function LinkedInNode({ data }: { data: LinkedInNodeData }) {
  const content = data?.content || "Proud to introduce the brilliant people behind Micra. We're a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.";

  return (
    <div className="w-[500px] bg-white p-5 rounded-xl shadow-md">
      <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full mr-3 flex items-center justify-center text-white font-bold">
                M
              </div>
              <div>
                  <p className="font-bold text-sm">MICRA Team</p>
                  <p className="text-xs text-gray-500">AI Content Assistant</p>
                  <p className="text-xs text-gray-500">Just now · <span>🌍</span></p>
              </div>
          </div>
          <MoreHorizontal className="text-gray-500 cursor-pointer hover:bg-gray-100 rounded p-1" />
      </div>
      <p className="text-sm mb-4 whitespace-pre-wrap leading-relaxed">
        {content}
      </p>
      <div className="flex justify-around text-sm text-gray-600 mt-4 pt-2 border-t">
          <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <ThumbsUp size={20}/> <span>Like</span>
          </button>
          <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <MessageCircle size={20}/> <span>Comment</span>
          </button>
          <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <Share2 size={20}/> <span>Share</span>
          </button>
          <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <Send size={20}/> <span>Send</span>
          </button>
      </div>
    </div>
  );
}
