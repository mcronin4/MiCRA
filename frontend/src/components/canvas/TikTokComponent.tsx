import React from 'react';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { Position } from '@xyflow/react';

export function TikTokComponent({ data }: { data: any }) {
  return (
    <div className="w-min">
      {/* TikTok Draft */}
      <div className="relative bg-black w-80 h-[560px] rounded-3xl shadow-lg overflow-hidden">
        <div className="absolute inset-0 bg-gray-800">
          {/* Placeholder for video content */}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white bg-gradient-to-t from-black/50 to-transparent">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full"></div>
                <p className="font-semibold text-sm">@username</p>
              </div>
              <p className="text-xs">This is the caption of the TikTok video! #fyp #viral</p>
              <p className="text-xs font-medium">♫ Original Sound - username</p>
            </div>
            <div className="flex flex-col items-center space-y-4">
              <div className="flex flex-col items-center space-y-1">
                <div className="w-10 h-10 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xl">+</div>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <Heart size={32} fill="white" />
                <span className="text-xs font-semibold">1.2M</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <MessageCircle size={32} fill="white" />
                <span className="text-xs font-semibold">40K</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <Share2 size={32} />
                <span className="text-xs font-semibold">12K</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
