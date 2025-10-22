import React from 'react';
import { MessageCircle, Send, Share2, MoreHorizontal } from 'lucide-react';

const LinkedInPost = () => (
  <div className="w-[500px] bg-white p-5 rounded-xl shadow-md cursor-move">
    {/* LinkedIn Post Draft */}
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
            <div className="w-12 h-12 bg-gray-300 rounded-full mr-3"></div>
            <div>
                <p className="font-bold text-sm">MICRA Team</p>
                <p className="text-xs text-gray-500">Java Technical Lead — MICRA</p>
                <p className="text-xs text-gray-500">16 h · <span>🌍</span></p>
            </div>
        </div>
        <MoreHorizontal className="text-gray-500" />
    </div>
    <p className="text-sm mb-4">
    Proud to introduce the brilliant people behind Micra. We're a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.
    </p>
    <div className="bg-gray-100 rounded-lg p-4">
        <p className="text-center font-semibold text-purple-700 mb-2">MICRA</p>
        <p className="text-center text-xs text-gray-600 mb-4">Meet the Team</p>
        <div className="flex justify-center space-x-4">
            <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
            <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
            <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
        </div>
    </div>
    <div className="flex justify-around text-sm text-gray-600 mt-4 pt-2 border-t">
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><Share2 size={20}/> <span>Like</span></button>
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><MessageCircle size={20}/> <span>Comment</span></button>
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><Share2 size={20}/> <span>Share</span></button>
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><Send size={20}/> <span>Send</span></button>
    </div>
  </div>
);

export default LinkedInPost;
