import React from 'react';

export const AudioTab: React.FC = () => {
  return (
    <div>
      <div className="bg-gray-800/10 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-center h-24">
          <p className="text-gray-500 text-sm">Audio Player</p>
        </div>
      </div>
      <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
      <div className="text-xs text-gray-600">
        <p>[00:01] Speaker 1: Hello and welcome...</p>
        <p>[00:05] Speaker 2: Thanks for having me...</p>
      </div>
    </div>
  );
};

