import React from 'react';

export const ImagesTab: React.FC = () => {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
        <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
        <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
        <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
      </div>
      <h3 className="font-semibold mb-2 text-sm">Captions</h3>
      <div className="text-xs text-gray-600">
        <p>Image 1: A team of developers working together.</p>
        <p>Image 2: Close-up on a line of code.</p>
      </div>
    </div>
  );
};

