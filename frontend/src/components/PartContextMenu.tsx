import React from 'react';
import { Button } from './ui/button';
import { Copy, Trash2, CopyPlus } from 'lucide-react';

type PartContextMenuProps = {
  position: { x: number; y: number };
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onClose: () => void;
};

const PartContextMenu: React.FC<PartContextMenuProps> = ({
  position,
  onDelete,
  onDuplicate,
  onCopy,
  onClose,
}) => {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="absolute bg-white/70 backdrop-blur-sm border border-gray-200/50 rounded-xl shadow-xl z-50 flex flex-col p-2"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Button variant="ghost" className="w-full justify-start px-3" onClick={() => handleAction(onDuplicate)}>
        <CopyPlus size={16} className="mr-2" />
        Duplicate
      </Button>
      <Button variant="ghost" className="w-full justify-start px-3" onClick={() => handleAction(onCopy)}>
        <Copy size={16} className="mr-2" />
        Copy
      </Button>
      <Button variant="ghost" className="w-full justify-start px-3 text-red-500 hover:text-red-500" onClick={() => handleAction(onDelete)}>
        <Trash2 size={16} className="mr-2" />
        Delete
      </Button>
    </div>
  );
};

export default PartContextMenu;
