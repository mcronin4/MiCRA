import React from 'react';
import { Plus, Minus, Maximize, Lock } from 'lucide-react';

interface ZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onToggleLock: () => void;
  isLocked: boolean;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  scale,
  onZoomIn,
  onZoomOut,
  onFitView,
  onToggleLock,
  isLocked,
}) => {
  return (
    <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg flex flex-col items-center">
      <button onClick={onZoomIn} className="p-2 hover:bg-gray-100 w-full">
        <Plus size={20} />
      </button>
      <button onClick={onZoomOut} className="p-2 hover:bg-gray-100 w-full">
        <Minus size={20} />
      </button>
      <div className="w-full border-t border-gray-200 my-1"></div>
      <span className="text-xs font-medium py-1">{Math.round(scale * 100)}%</span>
      <div className="w-full border-t border-gray-200 my-1"></div>
      <button onClick={onFitView} className="p-2 hover:bg-gray-100 w-full">
        <Maximize size={16} />
      </button>
      <button onClick={onToggleLock} className={`p-2 hover:bg-gray-100 w-full ${isLocked ? 'text-blue-500' : ''}`}>
        <Lock size={16} />
      </button>
    </div>
  );
};

export default ZoomControls;
