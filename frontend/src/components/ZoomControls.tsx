import React from 'react';
import { Plus, Minus } from 'lucide-react';

interface ZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ scale, onZoomIn, onZoomOut }) => {
  return (
    <div className="absolute bottom-4 right-4 bg-white rounded-full shadow-lg p-2 flex items-center space-x-2">
      <button onClick={onZoomOut} className="p-1 rounded-full hover:bg-gray-100">
        <Minus size={20} />
      </button>
      <span className="text-sm font-medium">{Math.round(scale * 100)}%</span>
      <button onClick={onZoomIn} className="p-1 rounded-full hover:bg-gray-100">
        <Plus size={20} />
      </button>
    </div>
  );
};

export default ZoomControls;
