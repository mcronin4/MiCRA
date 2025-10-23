import React from 'react';

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
  return (
    <div
      className="absolute bg-white shadow-lg rounded-md p-2 z-50"
      style={{ top: position.y, left: position.x }}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul>
        <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={onDuplicate}>
          Duplicate
        </li>
        <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={onCopy}>
          Copy
        </li>
        <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-red-500" onClick={onDelete}>
          Delete
        </li>
      </ul>
    </div>
  );
};

export default PartContextMenu;
