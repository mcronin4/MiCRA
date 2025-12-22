import { useState, useRef } from 'react';

export const useContextMenus = () => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [partContextMenu, setPartContextMenu] = useState<{ x: number; y: number; partId: string } | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handlePartContextMenu = (e: React.MouseEvent<HTMLDivElement>, partId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPartContextMenu({ x: x + 5, y: y + 5, partId });
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMenuPosition({ x: x + 5, y: y + 5 });
    }
  };

  return {
    menuPosition,
    setMenuPosition,
    partContextMenu,
    setPartContextMenu,
    canvasContainerRef,
    handlePartContextMenu,
    handleCanvasContextMenu,
  };
};

