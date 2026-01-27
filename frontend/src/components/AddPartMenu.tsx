'use client';

import React, { useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Linkedin, Mail, Image as ImageIcon, FileText, Video } from 'lucide-react';
import { FaTiktok } from 'react-icons/fa';
import { NodeType } from './final-review/types';

interface AddPartMenuProps {
  onAddPart: (nodeType: NodeType) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

const AddPartMenu: React.FC<AddPartMenuProps> = ({ onAddPart, onClose, position }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add event listener on mount with capture phase to catch events before ReactFlow
    document.addEventListener('mousedown', handleClickOutside, true);

    // Clean up on unmount
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [onClose]);

  const parts: { name: NodeType; label: string; icon: React.ReactNode }[] = [
    { name: 'LinkedIn', label: 'Generate LinkedIn Post', icon: <Linkedin size={16} className="mr-2" /> },
    { name: 'TikTok', label: 'Generate TikTok', icon: <FaTiktok size={16} className="mr-2" /> },
    { name: 'Email', label: 'Generate Email', icon: <Mail size={16} className="mr-2" /> },
    { name: 'TextGeneration', label: 'Text Generation', icon: <FileText size={16} className="mr-2" /> },
    { name: 'ImageMatching', label: 'Image-Text Matching', icon: <ImageIcon size={16} className="mr-2" aria-label="Image matching" /> },
    { name: 'ImageExtraction', label: 'Image Extraction', icon: <Video size={16} className="mr-2" aria-label="Image extraction" /> },
  ];

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="absolute bg-white/70 backdrop-blur-sm border border-gray-200/50 rounded-xl shadow-xl z-50 flex flex-col p-2"
      style={{ top: position.y, left: position.x }}
    >
      {parts.map((part) => (
        <Button
          key={part.name}
          variant="ghost"
          className="w-full justify-start px-3 text-xs"
          onClick={() => handleAction(() => onAddPart(part.name))}
        >
          {part.icon}
          {part.label}
        </Button>
      ))}
    </div>
  );
};

export default AddPartMenu;
