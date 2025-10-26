import React from 'react';
import { Plus, Minus, Maximize, Lock, LockOpen } from 'lucide-react';
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
      <Button variant="ghost" size="icon" onClick={onZoomIn} title="Zoom In">
        <Plus size={20} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onZoomOut} title="Zoom Out">
        <Minus size={20} />
      </Button>
      <div className="w-full border-t border-gray-200/80 my-1"></div>
      <Button variant="ghost" size="icon" onClick={onFitView} title="Fit View">
        <Maximize size={16} />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={onToggleLock} 
        className={`relative group ${isLocked ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}
        title={isLocked ? 'Locked - Click to Open' : 'Open - Click to Lock'}
      >
        {isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
        <span className="absolute -left-20 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {isLocked ? 'Closed' : 'Open'}
        </span>
      </Button>
    </div>
  );
};

export default ZoomControls;
