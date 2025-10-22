import React from 'react';
import { Heart, MessageCircle, Share2 } from 'lucide-react';

const TikTokPost = () => (
  <div className="cursor-move w-min">
    {/* TikTok Draft */}
    <div className="bg-black w-64 h-[450px] rounded-3xl p-2 shadow-lg">
        <div className="bg-gray-800 h-full w-full rounded-2xl flex flex-col justify-end items-end p-4 space-y-4">
            <div className="flex flex-col items-center space-y-1 text-white">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">+</div>
            </div>
            <div className="flex flex-col items-center space-y-1 text-white">
                <Heart size={32} />
                <span className="text-xs">1.2M</span>
            </div>
            <div className="flex flex-col items-center space-y-1 text-white">
                <MessageCircle size={32} />
                <span className="text-xs">40K</span>
            </div>
            <div className="flex flex-col items-center space-y-1 text-white">
                <Share2 size={32} />
                <span className="text-xs">12K</span>
            </div>
        </div>
    </div>
  </div>
);

export default TikTokPost;
