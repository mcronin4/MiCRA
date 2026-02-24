"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon,
  FileText,
  Sparkles,
  Film,
  Mic,
  TextQuote,
} from "lucide-react";
import type { NodeType } from "./types";

interface AddPartMenuProps {
  onAddPart: (nodeType: NodeType) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

const AddPartMenu: React.FC<AddPartMenuProps> = ({
  onAddPart,
  onClose,
  position,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add event listener on mount with capture phase to catch events before ReactFlow
    document.addEventListener("mousedown", handleClickOutside, true);

    // Clean up on unmount
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [onClose]);

  const parts: { name: NodeType; label: string; icon: React.ReactNode }[] = [
    {
      name: "TextGeneration",
      label: "Text Generation",
      icon: <FileText size={16} className="mr-2" />,
    },
    {
      name: "Transcription",
      label: "Transcription",
      icon: <Mic size={16} className="mr-2" aria-label="Transcription" />,
    },
    {
      name: "ImageMatching",
      label: "Image-Text Matching",
      icon: (
        <ImageIcon size={16} className="mr-2" aria-label="Image matching" />
      ),
    },
    {
      name: "ImageGeneration",
      label: "Image Generation",
      icon: <Sparkles size={16} className="mr-2" />,
    },
    {
      name: "ImageExtraction",
      label: "Image Extraction",
      icon: <Film size={16} className="mr-2" aria-label="Image extraction" />,
    },
    {
      name: "QuoteExtraction",
      label: "Quote Extraction",
      icon: <TextQuote size={16} className="mr-2" aria-label="Quote extraction" />,
    },
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
