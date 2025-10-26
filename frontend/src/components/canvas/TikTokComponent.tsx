import React from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music2 } from 'lucide-react';
import { Position } from '@xyflow/react';

export function TikTokComponent({ data }: { data: any }) {
  const username = data?.username || '@micra_official';
  const caption = data?.caption || 'Check out this amazing content! 🔥 #contentcreation #micra #innovation';
  const music = data?.music || 'Original Sound - MiCRA';
  const likes = data?.likes || '1.2M';
  const comments = data?.comments || '40.2K';
  const shares = data?.shares || '12.5K';
  const bookmarks = data?.bookmarks || '89.3K';

  return (
    <div className="w-min">
      {/* TikTok Draft */}
      <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-black w-80 h-[580px] rounded-[28px] shadow-2xl overflow-hidden border border-gray-700">
        {/* Video Background with Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-blue-900/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(147,51,234,0.2),transparent_50%)]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(236,72,153,0.2),transparent_50%)]"></div>
          {/* Placeholder for video content */}
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-gray-600">
              <Music2 size={64} strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Bottom Content Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-32">
          <div className="flex justify-between items-end gap-3">
            {/* Left Side - User Info & Caption */}
            <div className="flex-1 space-y-3 min-w-0">
              {/* User Info */}
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                  M
                </div>
                <p className="font-bold text-base">{username}</p>
              </div>
              
              {/* Caption */}
              <p className="text-sm leading-relaxed line-clamp-3 break-words">
                {caption}
              </p>
              
              {/* Music */}
              <div className="flex items-center space-x-2">
                <Music2 size={14} className="flex-shrink-0" />
                <p className="text-xs font-medium truncate">{music}</p>
              </div>
            </div>

            {/* Right Side - Action Buttons */}
            <div className="flex flex-col items-center space-y-5 pb-2">
              {/* Follow Button */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xl">M</span>
                  </div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-[#FE2C55] rounded-full border-2 border-black flex items-center justify-center">
                    <span className="text-white font-bold text-xs leading-none">+</span>
                  </div>
                </div>
              </div>

              {/* Like Button */}
              <div className="flex flex-col items-center space-y-1">
                <div className="transition-transform hover:scale-110 cursor-pointer">
                  <Heart size={34} fill="white" stroke="white" className="drop-shadow-lg" />
                </div>
                <span className="text-xs font-bold drop-shadow-md">{likes}</span>
              </div>

              {/* Comment Button */}
              <div className="flex flex-col items-center space-y-1">
                <div className="transition-transform hover:scale-110 cursor-pointer">
                  <MessageCircle size={34} fill="white" stroke="white" className="drop-shadow-lg" />
                </div>
                <span className="text-xs font-bold drop-shadow-md">{comments}</span>
              </div>

              {/* Bookmark Button */}
              <div className="flex flex-col items-center space-y-1">
                <div className="transition-transform hover:scale-110 cursor-pointer">
                  <Bookmark size={32} fill="white" stroke="white" className="drop-shadow-lg" />
                </div>
                <span className="text-xs font-bold drop-shadow-md">{bookmarks}</span>
              </div>

              {/* Share Button */}
              <div className="flex flex-col items-center space-y-1">
                <div className="transition-transform hover:scale-110 cursor-pointer">
                  <Share2 size={32} stroke="white" strokeWidth={2} className="drop-shadow-lg" />
                </div>
                <span className="text-xs font-bold drop-shadow-md">{shares}</span>
              </div>

              {/* Rotating Music Disc */}
              <div className="mt-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg animate-spin-slow border-2 border-white/50">
                  <div className="w-3 h-3 bg-black rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Watermark */}
        <div className="absolute top-4 left-0 right-0 flex justify-between items-start px-4">
          <div className="text-white/80 text-xs font-medium">
            📱 TikTok Draft
          </div>
        </div>
      </div>
    </div>
  );
}
