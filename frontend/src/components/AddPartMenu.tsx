import React from 'react';

type PartType = 'LinkedIn' | 'TikTok' | 'Email';

interface AddPartMenuProps {
  onAddPart: (partType: PartType) => void;
  onClose: () => void;
}

const AddPartMenu: React.FC<AddPartMenuProps> = ({ onAddPart, onClose }) => {
  const parts: PartType[] = ['LinkedIn', 'TikTok', 'Email'];

  return (
    <div className="absolute bg-white rounded-lg shadow-lg p-2">
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
      </ul>
    </div>
  );
};

export default AddPartMenu;
