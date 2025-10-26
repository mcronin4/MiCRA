"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, ArrowUp, PanelLeft, PanelRight } from 'lucide-react';
import { ReactFlowWrapper } from './canvas/ReactFlowWrapper';
import type { Node, Edge, OnConnect } from '@xyflow/react';
import { LinkedInComponent } from './canvas/LinkedInComponent';
import { TikTokComponent } from './canvas/TikTokComponent';
import { EmailComponent } from './canvas/EmailComponent';
import AddPartMenu from './AddPartMenu';
import ZoomControls from './ZoomControls';
import PartContextMenu from './PartContextMenu';

type SourceType = 'Video' | 'Audio' | 'Images' | 'Text';

const nodeTypes = {
  LinkedIn: LinkedInComponent,
  TikTok: TikTokComponent,
  Email: EmailComponent,
};

const FinalReview = () => {
  const [activeTab, setActiveTab] = useState<SourceType>('Video');
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [partContextMenu, setPartContextMenu] = useState<{ x: number; y: number; partId: string } | null>(null);
  const [copiedPart, setCopiedPart] = useState<Node | null>(null);
  const [newPartPosition, setNewPartPosition] = useState<{ x: number; y: number } | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ user: string; text: string; isLoading?: boolean }[]>([]);
  const [conversationState, setConversationState] = useState<any>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
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

  const SourceMediaContent = () => {
    switch (activeTab) {
      case 'Video':
        return (
          <div>
            <div className="bg-gray-800/10 aspect-video mb-4 rounded-lg">
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-sm">Media Player</p>
              </div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Keyframes</h3>
            <div className="flex space-x-2 mb-4">
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
            <div className="text-xs text-gray-600">
              <p>[00:01] Speaker 1: Hello and welcome...</p>
              <p>[00:05] Speaker 2: Thanks for having me...</p>
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
          <div>
            <div className="bg-gray-800/5 p-4 rounded-lg mb-4 h-48 overflow-y-auto">
              <p className="text-xs text-gray-700 leading-relaxed">
                This is the full text document. It can be scrolled through to read all the content that has been provided as source material for the generated drafts. This text could be a blog post, an article, a whitepaper, or any other long-form text content.
                <br /><br />
                The system will use this text to extract key points, summarize information, and generate various social media posts and other content formats based on the core message of the document.
              </p>
            </div>
          </div>
        );
      default:
        return <div className="text-sm text-gray-500">Content for {activeTab}</div>;
    }
  };

  const handleAddPart = (partType: 'LinkedIn' | 'TikTok' | 'Email', setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => {
    if (reactFlowInstance && newPartPosition) {
      const position = reactFlowInstance.screenToFlowPosition({
        x: newPartPosition.x,
        y: newPartPosition.y,
      });
      const newNode: Node = {
        id: `${partType}-${nextId.current++}`,
        type: partType,
        position,
        data: { label: `${partType} node` },
      };
      setNodes((nds: Node[]) => nds.concat(newNode));
      setNewPartPosition(null);
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

  const addNodeToCanvas = useCallback((nodeType: 'LinkedIn' | 'TikTok' | 'Email', content: string) => {
    if (!setNodesRef.current || !reactFlowInstance) return;

    // Add node in the center of the canvas
    const viewport = reactFlowInstance.getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

    const newNode: Node = {
      id: `${nodeType}-${nextId.current++}`,
      type: nodeType,
      position: { x: centerX - 250, y: centerY - 200 }, // Offset to center the node
      data: { label: `${nodeType} node`, content },
    };

    setNodesRef.current((nds: Node[]) => nds.concat(newNode));
  }, [reactFlowInstance]);

  const handleSendMessage = async () => {
    if (chatMessage.trim() === '') return;

    const userMessage = { user: 'You', text: chatMessage };
    setChatHistory(prev => [...prev, userMessage]);
    
    // Add loading message
    const loadingMessage = { user: 'MICRAi', text: '', isLoading: true };
    setChatHistory(prev => [...prev, loadingMessage]);
    
    const currentMessage = chatMessage;
    setChatMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }

    try {
      const response = await fetch('/backend/v1/hitl/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: currentMessage,
          conversation_state: conversationState
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      // Update conversation state
      if (data.conversation_state !== undefined) {
        setConversationState(data.conversation_state);
      }
      
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
          <div className="flex-grow overflow-y-auto space-y-6">
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
          <div ref={chatHistoryRef} className="flex-grow overflow-y-auto space-y-6 pr-4">
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
                    <p className="text-sm">{chat.text}</p>
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
                onClick={handleSendMessage}
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

const CanvasArea = ({
  ReactFlow,
  Background,
  Controls,
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
}: any) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
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
          onAddPart={(partType) => handleAddPart(partType, setNodes)}
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
        scale={reactFlowInstance ? reactFlowInstance.getZoom() : 1}
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
