import { useState, useRef, useEffect } from 'react';
import type { ChatMessage, ConversationState, SourceText, NodeContent } from '@/components/final-review/types';
import { apiClient } from '@/lib/fastapi/client';

interface ChatResponse {
  message: string;
  action?: string | null;
  content?: string | Record<string, unknown> | null;
  conversation_state?: Record<string, unknown> | null;
}

interface UseChatConversationProps {
  sourceTexts: SourceText[];
  onAddNodeToCanvas: (nodeType: string, content?: string | NodeContent) => void;
}

export const useChatConversation = ({ sourceTexts, onAddNodeToCanvas }: UseChatConversationProps) => {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>({});
  const [tonePreference, setTonePreference] = useState<string>('');
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Auto-generate when canvas triggers generation with source + tone
  useEffect(() => {
    const autoGenerate = async () => {
      const currentState = conversationState;
      const currentSources = sourceTexts;
      const currentTone = tonePreference;
      
      if (currentState.generating_from_canvas && currentSources.length > 0 && currentTone) {
        // Add loading message
        const loadingMessage: ChatMessage = { user: 'MICRAi', text: '', isLoading: true };
        setChatHistory(prev => [...prev, loadingMessage]);
        
        try {
          const sourceTextsForAPI = currentSources.map(source => ({
            id: source.id,
            title: source.title,
            content: source.content
          }));

          const data = await apiClient.request<ChatResponse>('/v1/hitl/chat', {
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
          
          // Remove loading message
          setChatHistory(prev => prev.filter(msg => !msg.isLoading));
          
          const botMessage: ChatMessage = { user: 'MICRAi', text: data.message };
          setChatHistory(prev => [...prev, botMessage]);

          // Handle actions (create nodes)
          if (data.action && data.content) {
            if (data.action === 'create_linkedin') {
              onAddNodeToCanvas('LinkedIn', data.content);
            } else if (data.action === 'create_email') {
              onAddNodeToCanvas('Email', data.content);
            } else if (data.action === 'create_tiktok') {
              onAddNodeToCanvas('TikTok', data.content);
            }
          }
          
          // Clear conversation state
          setConversationState({});
        } catch (error) {
          console.error('Error generating content:', error);
          setChatHistory(prev => prev.filter(msg => !msg.isLoading));
          const errorMessage: ChatMessage = { user: 'MICRAi', text: 'Sorry, something went wrong. Please try again.' };
          setChatHistory(prev => [...prev, errorMessage]);
          setConversationState({});
        }
      }
    };
    
    autoGenerate();
  }, [conversationState.generating_from_canvas, sourceTexts.length, tonePreference, onAddNodeToCanvas, conversationState, sourceTexts]);

  const handleSendMessage = async (messageOverride?: string) => {
    const messageToSend = messageOverride || chatMessage;
    if (messageToSend.trim() === '') return;

    // Only add user message if not already added (when using messageOverride)
    if (!messageOverride) {
      const userMessage: ChatMessage = { user: 'You', text: messageToSend };
      setChatHistory(prev => [...prev, userMessage]);
    }
    
    // Add loading message
    const loadingMessage: ChatMessage = { user: 'MICRAi', text: '', isLoading: true };
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

      const data = await apiClient.request<ChatResponse>('/v1/hitl/chat', {
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
      
      // Update conversation state
      if (data.conversation_state !== undefined) {
        setConversationState(data.conversation_state);
      }
      
      // Remove loading message
      setChatHistory(prev => prev.filter(msg => !msg.isLoading));
      
      const botMessage: ChatMessage = { 
        user: 'MICRAi', 
        text: data.message,
        showToneOptions: data.conversation_state?.show_tone_options || false
      };
      setChatHistory(prev => [...prev, botMessage]);

      // Handle actions (create nodes)
      if (data.action && data.content) {
        if (data.action === 'create_linkedin') {
          onAddNodeToCanvas('LinkedIn', data.content);
        } else if (data.action === 'create_email') {
          onAddNodeToCanvas('Email', data.content);
        } else if (data.action === 'create_tiktok') {
          onAddNodeToCanvas('TikTok', data.content);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove loading message
      setChatHistory(prev => prev.filter(msg => !msg.isLoading));
      const errorMessage: ChatMessage = { user: 'MICRAi', text: 'Sorry, something went wrong. Please try again.' };
      setChatHistory(prev => [...prev, errorMessage]);
    }
  };

  const handleToneSelect = async (tone: string) => {
    setTonePreference(tone);
    
    // Add user's selection to chat
    const userMessage: ChatMessage = { user: 'You', text: tone };
    setChatHistory(prev => [...prev, userMessage]);
    
    // Trigger the next step in conversation
    await handleSendMessage(tone);
  };

  return {
    chatMessage,
    setChatMessage,
    chatHistory,
    setChatHistory,
    conversationState,
    setConversationState,
    tonePreference,
    chatHistoryRef,
    textareaRef,
    handleSendMessage,
    handleToneSelect,
  };
};

