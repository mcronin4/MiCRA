import { useState, useRef } from 'react';
import type { SourceText } from '@/components/workflow/types';

export const useSourceTexts = () => {
  const [sourceTexts, setSourceTexts] = useState<SourceText[]>([]);
  const [newSourceContent, setNewSourceContent] = useState('');
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const sourceIdCounter = useRef(0);

  const handleAddSource = () => {
    if (newSourceContent.trim() === '') return;
    
    const title = newSourceContent.slice(0, 30) + (newSourceContent.length > 30 ? '...' : '');
    const newSource: SourceText = {
      id: `source-${sourceIdCounter.current++}`,
      title,
      content: newSourceContent,
      createdAt: new Date(),
    };
    
    setSourceTexts(prev => [...prev, newSource]);
    setNewSourceContent('');
  };

  const handleDeleteSource = (id: string) => {
    setSourceTexts(prev => prev.filter(source => source.id !== id));
  };

  const handleEditSource = (id: string) => {
    const source = sourceTexts.find(s => s.id === id);
    if (source) {
      setEditingSourceId(id);
      setEditingContent(source.content);
      setEditingTitle(source.title);
    }
  };

  const handleSaveEdit = (id: string) => {
    setSourceTexts(prev => prev.map(source => 
      source.id === id 
        ? { ...source, title: editingTitle, content: editingContent }
        : source
    ));
    setEditingSourceId(null);
    setEditingContent('');
    setEditingTitle('');
  };

  const handleCancelEdit = () => {
    setEditingSourceId(null);
    setEditingContent('');
    setEditingTitle('');
  };

  const addSourceFromTranscription = (fullText: string) => {
    if (fullText) {
      const title = fullText.slice(0, 30) + (fullText.length > 30 ? '...' : '');
      const newSource: SourceText = {
        id: `source-${sourceIdCounter.current++}`,
        title,
        content: fullText,
        createdAt: new Date(),
      };
      setSourceTexts(prev => [...prev, newSource]);
    }
  };

  return {
    sourceTexts,
    newSourceContent,
    setNewSourceContent,
    editingSourceId,
    editingContent,
    setEditingContent,
    editingTitle,
    setEditingTitle,
    handleAddSource,
    handleDeleteSource,
    handleEditSource,
    handleSaveEdit,
    handleCancelEdit,
    addSourceFromTranscription,
  };
};

