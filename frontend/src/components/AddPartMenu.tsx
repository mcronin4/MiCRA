import React from 'react';

type PartType = 'LinkedIn' | 'TikTok' | 'Email';

interface AddPartMenuProps {
  onAddPart: (partType: PartType) => void;
  onClose: () => void;
  position: { x: number; y: number };
  onPaste?: () => void;
  canPaste?: boolean;
}

const AddPartMenu: React.FC<AddPartMenuProps> = ({ onAddPart, onClose, position, onPaste, canPaste }) => {
  const parts: PartType[] = ['LinkedIn', 'TikTok', 'Email'];

  return (
    <div className="absolute bg-white rounded-lg shadow-lg p-2" style={{ top: position.y, left: position.x }}>
      <ul>
        {parts.map((part) => (
          <li
            key={part}
            className="p-2 hover:bg-gray-100 cursor-pointer"
            onClick={() => {
              onAddPart(part);
              onClose();
            }}
          >
            {part}
          </li>
        ))}
        {canPaste && onPaste && (
          <li
            className="p-2 hover:bg-gray-100 cursor-pointer"
            onClick={() => {
              onPaste();
              onClose();
            }}
          >
            Paste
          </li>
        )}
      </ul>
    </div>
  );
};

export default AddPartMenu;
