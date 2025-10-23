import React from 'react';
import { Plus, Minus, Maximize, Lock } from 'lucide-react';
import { Button } from './ui/button';

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
    <div className="absolute bottom-4 right-4 bg-white/70 backdrop-blur-sm border border-gray-200/50 rounded-xl shadow-lg flex flex-col items-center p-1 space-y-1">
      <Button variant="ghost" size="icon" onClick={onZoomIn}>
        <Plus size={20} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onZoomOut}>
        <Minus size={20} />
      </Button>
      <div className="w-full border-t border-gray-200/80 my-1"></div>
      <Button variant="ghost" size="icon" onClick={onFitView}>
        <Maximize size={16} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onToggleLock} className={`${isLocked ? 'text-blue-500' : ''}`}>
        <Lock size={16} />
      </Button>
    </div>
  );
};

export default ZoomControls;
