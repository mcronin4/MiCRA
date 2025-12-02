"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, ArrowUp, PanelLeft, PanelRight } from 'lucide-react';
import { ReactFlowWrapper } from './canvas/ReactFlowWrapper';
import type { Node, Edge, OnConnect, ReactFlowInstance } from '@xyflow/react';
import { LinkedInComponent } from './canvas/LinkedInComponent';
import { TikTokComponent } from './canvas/TikTokComponent';
import { EmailComponent } from './canvas/EmailComponent';
import AddPartMenu from './AddPartMenu';
import ZoomControls from './ZoomControls';
import PartContextMenu from './PartContextMenu';
import { transcribeUrl, transcribeFile } from '@/lib/fastapi/transcription';

type SourceType = 'Video' | 'Audio' | 'Images' | 'Text';

const nodeTypes = {
  LinkedIn: LinkedInComponent,
  TikTok: TikTokComponent,
  Email: EmailComponent,
};

interface SourceText {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}

const FinalReview = () => {
  const [activeTab, setActiveTab] = useState<SourceType>('Video');
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [partContextMenu, setPartContextMenu] = useState<{ x: number; y: number; partId: string } | null>(null);
  const [copiedPart, setCopiedPart] = useState<Node | null>(null);
  const [newPartPosition, setNewPartPosition] = useState<{ x: number; y: number } | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ user: string; text: string; isLoading?: boolean; showToneOptions?: boolean }[]>([]);
  const [conversationState, setConversationState] = useState<{
    generating_from_canvas?: boolean;
    waiting_for_tone?: boolean;
    waiting_for_context?: boolean;
    content_type?: string;
    user_instruction?: string;
    from_canvas?: boolean;
    show_tone_options?: boolean;
    [key: string]: unknown;
  }>({});
  const [sourceTexts, setSourceTexts] = useState<SourceText[]>([]);
  const [newSourceContent, setNewSourceContent] = useState('');
  const [tonePreference, setTonePreference] = useState<string>('');
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaInputType, setMediaInputType] = useState<'url' | 'file'>('url');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<{ segments: Array<{ start: number; end: number; text: string }> } | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const sourceIdCounter = useRef(0);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const setNodesRef = useRef<React.Dispatch<React.SetStateAction<Node[]>> | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]);

  interface NodeContent {
    content?: string;
    subject?: string;
    to?: string;
    username?: string;
    caption?: string;
    music?: string;
    likes?: string;
    comments?: string;
    shares?: string;
    bookmarks?: string;
    label?: string;
    [key: string]: unknown;
  }

  const addNodeToCanvas = useCallback((nodeType: 'LinkedIn' | 'TikTok' | 'Email', content: string | NodeContent) => {
    if (!setNodesRef.current || !reactFlowInstance) return;

    // Add node in the center of the canvas
    const viewport = reactFlowInstance.getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

    // Handle both string content and structured content
    let nodeData: NodeContent = { label: `${nodeType} node` };
    
    if (typeof content === 'string') {
      nodeData.content = content;
    } else if (typeof content === 'object' && content !== null) {
      // Merge structured content into node data
      nodeData = { ...nodeData, ...content };
    }

    const newNode: Node = {
      id: `${nodeType}-${nextId.current++}`,
      type: nodeType,
      position: { x: centerX - 250, y: centerY - 200 }, // Offset to center the node
      data: nodeData,
    };

    setNodesRef.current((nds: Node[]) => nds.concat(newNode));
  }, [reactFlowInstance]);

  // Auto-generate when canvas triggers generation with source + tone
  useEffect(() => {
    const autoGenerate = async () => {
      const currentState = conversationState;
      const currentSources = sourceTexts;
      const currentTone = tonePreference;
      
      if (currentState.generating_from_canvas && currentSources.length > 0 && currentTone) {
        // Add loading message
        const loadingMessage = { user: 'MICRAi', text: '', isLoading: true };
        setChatHistory(prev => [...prev, loadingMessage]);
        
        try {
          const sourceTextsForAPI = currentSources.map(source => ({
            id: source.id,
            title: source.title,
            content: source.content
          }));

          const response = await fetch('/backend/v1/hitl/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              message: 'Generate content from source material',
              conversation_state: currentState,
              source_texts: sourceTextsForAPI,
              tone_preference: currentTone
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Backend error:', response.status, errorText);
            throw new Error(`Network response was not ok: ${response.status}`);
          }

          const data = await response.json();
          
          // Remove loading message
          setChatHistory(prev => prev.filter(msg => !msg.isLoading));
          
          const botMessage = { user: 'MICRAi', text: data.message };
          setChatHistory(prev => [...prev, botMessage]);

          // Handle actions (create nodes)
          if (data.action && data.content) {
            if (data.action === 'create_linkedin') {
              addNodeToCanvas('LinkedIn', data.content);
            } else if (data.action === 'create_email') {
              addNodeToCanvas('Email', data.content);
            } else if (data.action === 'create_tiktok') {
              addNodeToCanvas('TikTok', data.content);
            }
          }
          
          // Clear conversation state
          setConversationState({});
        } catch (error) {
          console.error('Error generating content:', error);
          setChatHistory(prev => prev.filter(msg => !msg.isLoading));
          const errorMessage = { user: 'MICRAi', text: 'Sorry, something went wrong. Please try again.' };
          setChatHistory(prev => [...prev, errorMessage]);
          setConversationState({});
        }
      }
    };
    
    autoGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationState.generating_from_canvas, sourceTexts.length, tonePreference, addNodeToCanvas]);

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

  const handleToneSelect = async (tone: string) => {
    setTonePreference(tone);
    
    // Add user's selection to chat
    const userMessage = { user: 'You', text: tone };
    setChatHistory(prev => [...prev, userMessage]);
    
    // Trigger the next step in conversation
    await handleSendMessage(tone);
  };

  const SourceMediaContent = () => {
    switch (activeTab) {
      case 'Video':
        return (
          <div>
            <div className="mb-4 p-4">
              <div className="flex flex-col gap-3 h-full justify-center">
                {/* Input Type Toggle */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMediaInputType('url');
                      setSelectedFile(null);
                    }}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      mediaInputType === 'url'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Enter URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaInputType('file');
                      setMediaUrl('');
                    }}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      mediaInputType === 'file'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Upload File
                  </button>
                </div>

                {/* URL Input */}
                {mediaInputType === 'url' && (
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Enter video/audio URL"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}

                {/* File Upload */}
                {mediaInputType === 'file' && (
                  <div className="w-full">
                    <label className="flex flex-col items-center justify-center w-full h-20 px-3 py-2 text-sm border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col items-center justify-center">
                        <svg className="w-6 h-6 text-gray-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-xs text-gray-600">
                          {selectedFile ? selectedFile.name : 'Click to upload or drag and drop'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">MP3, MP4, WAV, MOV, MKV, etc.</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="audio/*,video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedFile(file);
                          }
                        }}
                      />
                    </label>
                    {selectedFile && (
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="mt-2 text-xs text-red-600 hover:text-red-700"
                      >
                        Remove file
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={async () => {
                    const hasInput = mediaInputType === 'url' ? mediaUrl.trim() : selectedFile !== null;
                    if (!hasInput) return;

                    setIsTranscribing(true);
                    setTranscriptionError(null);
                    setTranscriptionResult(null);
                    try {
                      let response;
                      if (mediaInputType === 'url') {
                        response = await transcribeUrl(mediaUrl.trim());
                      } else {
                        response = await transcribeFile(selectedFile!);
                      }
                      if (response.success && response.segments) {
                        setTranscriptionResult({ segments: response.segments });
                      } else {
                        setTranscriptionError(response.error || 'Transcription failed');
                      }
                    } catch (error) {
                      setTranscriptionError(error instanceof Error ? error.message : 'Failed to transcribe');
                    } finally {
                      setIsTranscribing(false);
                    }
                  }}
                  disabled={isTranscribing || (mediaInputType === 'url' ? !mediaUrl.trim() : !selectedFile)}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTranscribing ? 'Transcribing...' : 'Submit'}
                </button>
                {isTranscribing && (
                  <p className="text-xs text-gray-500 text-center">Processing audio, please wait...</p>
                )}
                {transcriptionError && (
                  <p className="text-xs text-red-500 text-center mt-2">{transcriptionError}</p>
                )}
              </div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Keyframes</h3>
            <div className="flex space-x-2 mb-4">
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
            <div className="text-xs text-gray-600 max-h-48 overflow-y-auto">
              {transcriptionResult && transcriptionResult.segments.length > 0 ? (
                transcriptionResult.segments.map((seg, index) => {
                  const minutes = Math.floor(seg.start / 60);
                  const seconds = Math.floor(seg.start % 60);
                  const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
                  return (
                    <p key={index} className="mb-1">
                      {timeStr} {seg.text}
                    </p>
                  );
                })
              ) : (
                <p className="text-gray-400 italic">No transcription yet. Submit a URL to transcribe.</p>
              )}
            </div>
          </div>
        );
      case 'Audio':
        return (
          <div>
            <div className="bg-gray-800/10 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-center h-24">
                <p className="text-gray-500 text-sm">Audio Player</p>
              </div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
            <div className="text-xs text-gray-600">
              <p>[00:01] Speaker 1: Hello and welcome...</p>
              <p>[00:05] Speaker 2: Thanks for having me...</p>
            </div>
          </div>
        );
      case 'Images':
        return (
          <div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Captions</h3>
            <div className="text-xs text-gray-600">
              <p>Image 1: A team of developers working together.</p>
              <p>Image 2: Close-up on a line of code.</p>
            </div>
          </div>
        );
      case 'Text':
        return (
          <div className="space-y-4">
            {/* New Source Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Add Source Text</label>
              <div className="p-0.5">
                <textarea
                  placeholder="Paste or type your source text here..."
                  className="w-full bg-gray-800/5 p-3 rounded-lg text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none border border-transparent focus:border-blue-500"
                  value={newSourceContent}
                  onChange={(e) => setNewSourceContent(e.target.value)}
                  rows={6}
                />
              </div>
              <button
                onClick={handleAddSource}
                disabled={!newSourceContent.trim()}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Source
              </button>
            </div>

            {/* Existing Sources */}
            {sourceTexts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-700">Source Materials ({sourceTexts.length})</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sourceTexts.map((source) => (
                    <div
                      key={source.id}
                      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
                    >
                      {editingSourceId === source.id ? (
                        // Edit Mode
                        <div className="space-y-2 p-0.5">
                          <input
                            type="text"
                            className="w-full bg-gray-50 px-2 py-1 rounded text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-transparent focus:border-blue-500"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            placeholder="Title..."
                          />
                          <textarea
                            className="w-full bg-gray-50 px-2 py-2 rounded text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none border border-transparent focus:border-blue-500"
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            rows={4}
                            placeholder="Content..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(source.id)}
                              className="flex-1 bg-blue-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-600 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="flex-1 bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-medium hover:bg-gray-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <>
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="text-xs font-semibold text-gray-800 flex-1">{source.title}</h5>
                            <div className="flex gap-1 ml-2">
                              <button
                                onClick={() => handleEditSource(source.id)}
                                className="text-gray-400 hover:text-blue-500"
                                title="Edit source"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteSource(source.id)}
                                className="text-gray-400 hover:text-red-500"
                                title="Delete source"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-3">{source.content}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sourceTexts.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-500">
                No source materials yet. Add text above to get started.
              </div>
            )}
          </div>
        );
      default:
        return <div className="text-sm text-gray-500">Content for {activeTab}</div>;
    }
  };

  const handleAddPart = (partType: 'LinkedIn' | 'TikTok' | 'Email') => {
    // Instead of adding empty node, trigger chat-based generation
    setMenuPosition(null);
    setNewPartPosition(null);
    
    // Ensure sidebar is visible
    if (!sidebarsVisible) {
      setSidebarsVisible(true);
    }
    
    // Map part type to content type string
    const contentTypeMap = {
      'LinkedIn': 'linkedin',
      'TikTok': 'tiktok', 
      'Email': 'email'
    };
    const contentType = contentTypeMap[partType];
    
    // Check if we have source text
    const hasSource = sourceTexts.length > 0;
    
    if (hasSource) {
      // Always ask for tone when generating from canvas
      const botMessage = { 
        user: 'MICRAi', 
        text: `I'll create a ${partType} ${contentType === 'linkedin' ? 'post' : contentType === 'email' ? 'draft' : 'script'} using your source material. What tone or style would you like?`,
        showToneOptions: true
      };
      setChatHistory(prev => [...prev, botMessage]);

      
      setConversationState({
        waiting_for_tone: true,
        content_type: contentType,
        user_instruction: 'Create content from source material',
        from_canvas: true
      });
    } else {
      // No source text, ask for context first
      const contentName = contentType === 'linkedin' ? 'LinkedIn post' : contentType === 'email' ? 'email' : 'TikTok script';
      const botMessage = { 
        user: 'MICRAi', 
        text: `I'll help you create a ${contentName}! What topic or message would you like to ${contentType === 'email' ? 'communicate' : 'share'}?`
      };
      setChatHistory(prev => [...prev, botMessage]);
      
      setConversationState({
        waiting_for_context: true,
        content_type: contentType,
        from_canvas: true
      });
    }
  };

  const handleDeletePart = (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => {
    setNodes((nds: Node[]) => nds.filter((node) => node.id !== partId));
    setPartContextMenu(null);
  };

  const handleDuplicatePart = (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>, nodes: Node[]) => {
    const partToDuplicate = nodes.find((node) => node.id === partId);
    if (partToDuplicate) {
      const newNode: Node = {
        ...partToDuplicate,
        id: `${partToDuplicate.type}-${nextId.current++}`,
        position: {
          x: partToDuplicate.position.x + 20,
          y: partToDuplicate.position.y + 20,
        },
      };
      setNodes((nds: Node[]) => nds.concat(newNode));
    }
    setPartContextMenu(null);
  };

  const handleCopyPart = (partId: string, nodes: Node[]) => {
    const partToCopy = nodes.find((node) => node.id === partId);
    if (partToCopy) {
      setCopiedPart(partToCopy);
    }
    setPartContextMenu(null);
  };

  const handlePastePart = (setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => {
    if (copiedPart && newPartPosition && reactFlowInstance) {
      const position = reactFlowInstance.screenToFlowPosition({
        x: newPartPosition.x,
        y: newPartPosition.y,
      });
      const newNode: Node = {
        ...copiedPart,
        id: `${copiedPart.type}-${nextId.current++}`,
        position,
      };
      setNodes((nds: Node[]) => nds.concat(newNode));
    }
  };

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
      setNewPartPosition({ x, y });
    }
  };

  const handleSendMessage = async (messageOverride?: string) => {
    const messageToSend = messageOverride || chatMessage;
    if (messageToSend.trim() === '') return;

    // Only add user message if not already added (when using messageOverride)
    if (!messageOverride) {
      const userMessage = { user: 'You', text: messageToSend };
      setChatHistory(prev => [...prev, userMessage]);
    }
    
    // Add loading message
    const loadingMessage = { user: 'MICRAi', text: '', isLoading: true };
    setChatHistory(prev => [...prev, loadingMessage]);
    
    const currentMessage = messageToSend;
    setChatMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }

    try {
      // Prepare source texts for API (serialize to plain objects)
      const sourceTextsForAPI = sourceTexts.map(source => ({
        id: source.id,
        title: source.title,
        content: source.content
      }));

      const response = await fetch('/backend/v1/hitl/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: currentMessage,
          conversation_state: conversationState,
          source_texts: sourceTextsForAPI.length > 0 ? sourceTextsForAPI : null,
          tone_preference: tonePreference || null
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend error:', response.status, errorText);
        throw new Error(`Network response was not ok: ${response.status}`);
      }

      const data = await response.json();
      
      // Update conversation state
      if (data.conversation_state !== undefined) {
        setConversationState(data.conversation_state);
      }
      
      // Remove loading message
      setChatHistory(prev => prev.filter(msg => !msg.isLoading));
      
      const botMessage = { 
        user: 'MICRAi', 
        text: data.message,
        showToneOptions: data.conversation_state?.show_tone_options || false
      };
      setChatHistory(prev => [...prev, botMessage]);

      // Handle actions (create nodes)
      if (data.action && data.content) {
        if (data.action === 'create_linkedin') {
          addNodeToCanvas('LinkedIn', data.content);
        } else if (data.action === 'create_email') {
          addNodeToCanvas('Email', data.content);
        } else if (data.action === 'create_tiktok') {
          addNodeToCanvas('TikTok', data.content);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove loading message
      setChatHistory(prev => prev.filter(msg => !msg.isLoading));
      const errorMessage = { user: 'MICRAi', text: 'Sorry, something went wrong. Please try again.' };
      setChatHistory(prev => [...prev, errorMessage]);
    }
  };

  return (
    <div className="h-screen flex font-sans text-[#1d1d1f] overflow-hidden">
      {/* Left Column: Source Media */}
      {sidebarsVisible && (
        <div className="w-[300px] h-full bg-white/80 backdrop-blur-lg p-6 shadow-lg flex flex-col">
          <div className="flex-grow overflow-y-auto space-y-6 pb-4">
            <h2 className="text-lg font-semibold mb-4">Source Media</h2>
            <div className="flex items-center space-x-4 border-b border-gray-200/80 pb-2 mb-4">
              {([ 'Video', 'Audio', 'Images', 'Text'] as SourceType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 text-sm font-medium transition-colors duration-200 ${
                    activeTab === tab
                      ? 'text-black border-b-2 border-black'
                      : 'text-gray-500 hover:text-black'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div>{SourceMediaContent()}</div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4">Auto-Checks & Flags</h2>
            <ul className="space-y-4 text-sm">
              <li className="flex justify-between items-center">
                <span className="text-gray-600">Image–text match score</span>
                <span className="font-medium text-gray-900">85%</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-gray-600">Proper noun checker</span>
                <span className="text-blue-500 font-medium cursor-pointer">Review</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-gray-600">Spell/grammar suggestions</span>
                <span className="font-medium text-gray-900">2 Found</span>
              </li>
              <li className="space-y-2">
                <span className="text-gray-600">Platform-limit meter</span>
                <div className="w-full bg-gray-200/70 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
                </div>
              </li>
              <li className="space-y-2">
                <span className="text-gray-600">Risks</span>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-yellow-400/30 text-yellow-900 text-xs font-medium px-2.5 py-1 rounded-full">
                    Brand Reputation
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Middle Column: Draggable Canvas */}
      <div
        ref={canvasContainerRef}
        className="flex-1 h-full relative bg-[#f0f2f5] overflow-hidden"
      >
        <ReactFlowWrapper>
          {(flowProps) => (
            <CanvasArea
              {...flowProps}
              menuPosition={menuPosition}
              partContextMenu={partContextMenu}
              copiedPart={copiedPart}
              handleAddPart={handleAddPart}
              handlePastePart={handlePastePart}
              handleDeletePart={handleDeletePart}
              handleDuplicatePart={handleDuplicatePart}
              handleCopyPart={handleCopyPart}
              setMenuPosition={setMenuPosition}
              setPartContextMenu={setPartContextMenu}
              handleCanvasContextMenu={handleCanvasContextMenu}
              handlePartContextMenu={handlePartContextMenu}
              setReactFlowInstance={setReactFlowInstance}
              reactFlowInstance={reactFlowInstance}
              isLocked={isLocked}
              setIsLocked={setIsLocked}
              setNodesRef={setNodesRef}
            />
          )}
        </ReactFlowWrapper>
        <button
          onClick={() => setSidebarsVisible(!sidebarsVisible)}
          className="absolute top-4 left-4 bg-white/80 backdrop-blur-lg p-2 rounded-lg shadow-lg"
        >
          {sidebarsVisible ? <PanelLeft size={20} /> : <PanelRight size={20} />}
        </button>
      </div>

      {/* Right Column: Chatbot */}
      {sidebarsVisible && (
        <div className="w-[300px] h-full bg-white/80 backdrop-blur-lg p-6 shadow-lg flex flex-col">
          <div ref={chatHistoryRef} className="flex-grow overflow-y-auto space-y-6 pr-4 pb-4">
            <h2 className="text-lg font-semibold mb-4">MICRAi</h2>
            
            {chatHistory.map((chat, index) => (
              <div key={index} className={`flex mb-4 ${chat.user === 'You' ? 'justify-end' : 'justify-start'}`}>
                <div className="flex-1">
                  {chat.user === 'You' ? (
                    <div className="bg-[#F4F4F6] text-[#1d1d1f] p-3 rounded-lg">
                      <p className="text-sm">{chat.text}</p>
                    </div>
                  ) : chat.isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm mb-3">{chat.text}</p>
                      {chat.showToneOptions && (
                        <div className="mt-3 space-y-2">
                          {['Professional', 'Friendly', 'Concise', 'Persuasive'].map((tone) => (
                            <button
                              key={tone}
                              onClick={() => handleToneSelect(tone)}
                              className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-800 transition-colors border border-gray-200 hover:border-gray-300"
                            >
                              <div className="flex items-center">
                                <div className="w-4 h-4 rounded-full border-2 border-gray-400 mr-3"></div>
                                <span className="font-medium">{tone}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {!chat.isLoading && (
                    <p className={`text-xs text-gray-400 mt-1 ${chat.user === 'You' ? 'text-right' : ''}`}>{chat.user}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isClient && <div className="mt-4 p-2 border rounded-lg bg-white/80 shadow-sm chat-input-container">
            <textarea
              ref={textareaRef}
              placeholder="Start with an idea or task."
              className="w-full bg-transparent focus:outline-none resize-none text-sm text-black placeholder-gray-500 max-h-40 overflow-y-auto"
              value={chatMessage}
              onChange={(e) => {
                setChatMessage(e.target.value);
                if (textareaRef.current) {
                  textareaRef.current.style.height = 'auto';
                  textareaRef.current.style.height = `${e.target.scrollHeight}px`;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={1}
            />
            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center space-x-2 text-gray-500">
                <Plus size={20} className="cursor-pointer hover:text-gray-800" />
              </div>
              <button
                className="bg-gray-200 text-gray-600 w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                onClick={() => handleSendMessage()}
                disabled={!chatMessage.trim()}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>}
        </div>
      )}
    </div>
  );
};

interface CanvasAreaProps {
  ReactFlow: React.ComponentType<Record<string, unknown>>;
  Background: React.ComponentType<Record<string, unknown>>;
  MiniMap: React.ComponentType<Record<string, unknown>>;
  useNodesState: <T extends Node = Node>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void];
  useEdgesState: <T extends Edge = Edge>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void];
  addEdge: (edgeParams: unknown, edges: Edge[]) => Edge[];
  menuPosition: { x: number; y: number } | null;
  partContextMenu: { x: number; y: number; partId: string } | null;
  copiedPart: Node | null;
  handleAddPart: (partType: 'LinkedIn' | 'TikTok' | 'Email') => void;
  handlePastePart: (setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => void;
  handleDeletePart: (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => void;
  handleDuplicatePart: (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>, nodes: Node[]) => void;
  handleCopyPart: (partId: string, nodes: Node[]) => void;
  setMenuPosition: (position: { x: number; y: number } | null) => void;
  setPartContextMenu: (menu: { x: number; y: number; partId: string } | null) => void;
  handleCanvasContextMenu: (e: React.MouseEvent) => void;
  handlePartContextMenu: (e: React.MouseEvent<HTMLDivElement>, partId: string) => void;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;
  reactFlowInstance: ReactFlowInstance | null;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  setNodesRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<Node[]>> | null>;
}

const CanvasArea = ({
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  menuPosition,
  partContextMenu,
  copiedPart,
  handleAddPart,
  handlePastePart,
  handleDeletePart,
  handleDuplicatePart,
  handleCopyPart,
  setMenuPosition,
  setPartContextMenu,
  handleCanvasContextMenu,
  handlePartContextMenu,
  setReactFlowInstance,
  reactFlowInstance,
  isLocked,
  setIsLocked,
  setNodesRef,
}: CanvasAreaProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  // Store setNodes in the parent's ref
  useEffect(() => {
    if (setNodesRef) {
      setNodesRef.current = setNodes;
    }
  }, [setNodesRef, setNodes]);
  
  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds: Edge[]) => addEdge(params, eds)),
    [setEdges, addEdge]
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        onPaneContextMenu={handleCanvasContextMenu}
        onNodeContextMenu={(event: React.MouseEvent<HTMLDivElement>, node: Node) => handlePartContextMenu(event, node.id)}
        fitView
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        panOnDrag={!isLocked}
        zoomOnScroll={!isLocked}
        zoomOnDoubleClick={!isLocked}
        panOnScroll={!isLocked}
      >
        <Background />
        <MiniMap position="bottom-left" />
      </ReactFlow>

      {menuPosition && (
        <AddPartMenu
          onAddPart={(partType) => handleAddPart(partType)}
          onClose={() => setMenuPosition(null)}
          position={menuPosition}
          onPaste={() => handlePastePart(setNodes)}
          canPaste={!!copiedPart}
        />
      )}
      {partContextMenu && (
        <PartContextMenu
          position={{ x: partContextMenu.x, y: partContextMenu.y }}
          onDelete={() => handleDeletePart(partContextMenu.partId, setNodes)}
          onDuplicate={() => handleDuplicatePart(partContextMenu.partId, setNodes, nodes)}
          onCopy={() => handleCopyPart(partContextMenu.partId, nodes)}
          onClose={() => setPartContextMenu(null)}
        />
      )}
      <ZoomControls
        onZoomIn={() => reactFlowInstance?.zoomIn()}
        onZoomOut={() => reactFlowInstance?.zoomOut()}
        onFitView={() => reactFlowInstance?.fitView()}
        onToggleLock={() => setIsLocked(!isLocked)}
        isLocked={isLocked}
      />
    </>
  );
};

export default FinalReview;