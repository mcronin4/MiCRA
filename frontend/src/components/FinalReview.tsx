"use client";
import React, { useState } from 'react';
import { ReactFlowWrapper } from './canvas/ReactFlowWrapper';
import { SourceMediaPanel } from './final-review/SourceMediaPanel';
import { ChatPanel } from './final-review/ChatPanel';
import { CanvasPanel } from './final-review/CanvasPanel';
import { useSourceTexts } from '@/hooks/useSourceTexts';
import { useTranscription } from '@/hooks/useTranscription';
import { useChatConversation } from '@/hooks/useChatConversation';
import { useCanvasOperations } from '@/hooks/useCanvasOperations';
import { useContextMenus } from '@/hooks/useContextMenus';
import type { SourceType, OutputNodeType, WorkflowNodeType } from './final-review/types';
import { WORKFLOW_NODES, OUTPUT_NODES } from './final-review/types';

const FinalReview = () => {
  const [activeTab, setActiveTab] = useState<SourceType>('Video');
  const [sidebarsVisible, setSidebarsVisible] = useState(true);

  // Custom hooks for state management
  const sourceTextsHook = useSourceTexts();
  const transcriptionHook = useTranscription(sourceTextsHook.addSourceFromTranscription);
  const canvasOps = useCanvasOperations();
  const contextMenus = useContextMenus();
  const chatHook = useChatConversation({
    sourceTexts: sourceTextsHook.sourceTexts,
    onAddNodeToCanvas: (nodeType: string, content?: string | Record<string, unknown>) => {
      canvasOps.addNodeToCanvas(nodeType as OutputNodeType | WorkflowNodeType, content);
    },
  });

  const handleAddPart = (partType: OutputNodeType | WorkflowNodeType) => {
    // Check if it's a workflow node - if so, just add it directly to canvas
    if (WORKFLOW_NODES.includes(partType as WorkflowNodeType)) {
      canvasOps.addNodeToCanvas(partType);
      contextMenus.setMenuPosition(null);
      return;
    }

    // For output nodes, trigger chat-based generation
    contextMenus.setMenuPosition(null);
    
    // Ensure sidebar is visible
    if (!sidebarsVisible) {
      setSidebarsVisible(true);
    }
    
    // Map part type to content type string
    const contentTypeMap: Record<OutputNodeType, string> = {
      'LinkedIn': 'linkedin',
      'TikTok': 'tiktok', 
      'Email': 'email'
    };
    const contentType = contentTypeMap[partType as OutputNodeType];
    
    // Check if we have source text
    const hasSource = sourceTextsHook.sourceTexts.length > 0;
    
    if (hasSource) {
      // Always ask for tone when generating from canvas
      const botMessage = { 
        user: 'MICRAi', 
        text: `I'll create a ${partType} ${contentType === 'linkedin' ? 'post' : contentType === 'email' ? 'draft' : 'script'} using your source material. What tone or style would you like?`,
        showToneOptions: true
      };
      chatHook.setChatHistory((prev: Array<{ user: string; text: string; showToneOptions?: boolean }>) => [...prev, botMessage]);

      chatHook.setConversationState({
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
      chatHook.setChatHistory((prev: Array<{ user: string; text: string; showToneOptions?: boolean }>) => [...prev, botMessage]);
      
      chatHook.setConversationState({
        waiting_for_context: true,
        content_type: contentType,
        from_canvas: true
      });
    }
  };

  return (
    <div className="h-screen flex font-sans text-[#1d1d1f] overflow-hidden">
      {/* Left Column: Source Media */}
      {sidebarsVisible && (
        <SourceMediaPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          // Video/Transcription props
          mediaUrl={transcriptionHook.mediaUrl}
          setMediaUrl={transcriptionHook.setMediaUrl}
          mediaInputType={transcriptionHook.mediaInputType}
          setMediaInputType={transcriptionHook.setMediaInputType}
          selectedFile={transcriptionHook.selectedFile}
          setSelectedFile={transcriptionHook.setSelectedFile}
          isTranscribing={transcriptionHook.isTranscribing}
          transcriptionResult={transcriptionHook.transcriptionResult}
          transcriptionError={transcriptionHook.transcriptionError}
          handleTranscribe={transcriptionHook.handleTranscribe}
          // Text/Source props
          sourceTexts={sourceTextsHook.sourceTexts}
          newSourceContent={sourceTextsHook.newSourceContent}
          setNewSourceContent={sourceTextsHook.setNewSourceContent}
          editingSourceId={sourceTextsHook.editingSourceId}
          editingContent={sourceTextsHook.editingContent}
          setEditingContent={sourceTextsHook.setEditingContent}
          editingTitle={sourceTextsHook.editingTitle}
          setEditingTitle={sourceTextsHook.setEditingTitle}
          handleAddSource={sourceTextsHook.handleAddSource}
          handleDeleteSource={sourceTextsHook.handleDeleteSource}
          handleEditSource={sourceTextsHook.handleEditSource}
          handleSaveEdit={sourceTextsHook.handleSaveEdit}
          handleCancelEdit={sourceTextsHook.handleCancelEdit}
        />
      )}

      {/* Middle Column: Draggable Canvas */}
      <ReactFlowWrapper>
        {(flowProps) => (
          <CanvasPanel
            {...flowProps}
            sidebarsVisible={sidebarsVisible}
            setSidebarsVisible={setSidebarsVisible}
            menuPosition={contextMenus.menuPosition}
            setMenuPosition={contextMenus.setMenuPosition}
            partContextMenu={contextMenus.partContextMenu}
            setPartContextMenu={contextMenus.setPartContextMenu}
            canvasContainerRef={contextMenus.canvasContainerRef}
            handleCanvasContextMenu={contextMenus.handleCanvasContextMenu}
            handlePartContextMenu={contextMenus.handlePartContextMenu}
            handleAddPart={handleAddPart}
            handleDeletePart={canvasOps.handleDeletePart}
            handleDuplicatePart={canvasOps.handleDuplicatePart}
            handleCopyContent={canvasOps.handleCopyContent}
            reactFlowInstance={canvasOps.reactFlowInstance}
            setReactFlowInstance={canvasOps.setReactFlowInstance}
            isLocked={canvasOps.isLocked}
            setIsLocked={canvasOps.setIsLocked}
            setNodesRef={canvasOps.setNodesRef}
          />
        )}
      </ReactFlowWrapper>

      {/* Right Column: Chatbot */}
      {sidebarsVisible && (
        <ChatPanel
          chatMessage={chatHook.chatMessage}
          setChatMessage={chatHook.setChatMessage}
          chatHistory={chatHook.chatHistory}
          chatHistoryRef={chatHook.chatHistoryRef}
          textareaRef={chatHook.textareaRef}
          handleSendMessage={chatHook.handleSendMessage}
          handleToneSelect={chatHook.handleToneSelect}
        />
      )}
    </div>
  );
};

export default FinalReview;
