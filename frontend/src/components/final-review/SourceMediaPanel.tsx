import React from 'react';
import type { SourceType } from './types';
import { VideoTab } from './tabs/VideoTab';
import { AudioTab } from './tabs/AudioTab';
import { ImagesTab } from './tabs/ImagesTab';
import { TextTab } from './tabs/TextTab';
import { FileUploadDropbox } from './FileUploadDropbox';

interface SourceMediaPanelProps {
  activeTab: SourceType;
  setActiveTab: (tab: SourceType) => void;
  // VideoTab props
  mediaUrl: string;
  setMediaUrl: (url: string) => void;
  mediaInputType: 'url' | 'file';
  setMediaInputType: (type: 'url' | 'file') => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  isTranscribing: boolean;
  transcriptionResult: { segments: Array<{ start: number; end: number; text: string }> } | null;
  transcriptionError: string | null;
  handleTranscribe: () => void;
  // TextTab props
  sourceTexts: Array<{ id: string; title: string; content: string; createdAt: Date }>;
  newSourceContent: string;
  setNewSourceContent: (content: string) => void;
  editingSourceId: string | null;
  editingContent: string;
  setEditingContent: (content: string) => void;
  editingTitle: string;
  setEditingTitle: (title: string) => void;
  handleAddSource: () => void;
  handleDeleteSource: (id: string) => void;
  handleEditSource: (id: string) => void;
  handleSaveEdit: (id: string) => void;
  handleCancelEdit: () => void;
}

export const SourceMediaPanel: React.FC<SourceMediaPanelProps> = ({
  activeTab,
  setActiveTab,
  mediaUrl,
  setMediaUrl,
  mediaInputType,
  setMediaInputType,
  selectedFile,
  setSelectedFile,
  isTranscribing,
  transcriptionResult,
  transcriptionError,
  handleTranscribe,
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
}) => {
  const renderTabContent = () => {
    switch (activeTab) {
      case 'Video':
        return (
          <VideoTab
            mediaUrl={mediaUrl}
            setMediaUrl={setMediaUrl}
            mediaInputType={mediaInputType}
            setMediaInputType={setMediaInputType}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            isTranscribing={isTranscribing}
            transcriptionResult={transcriptionResult}
            transcriptionError={transcriptionError}
            handleTranscribe={handleTranscribe}
          />
        );
      case 'Audio':
        return <AudioTab />;
      case 'Images':
        return <ImagesTab />;
      case 'Text':
        return (
          <TextTab
            sourceTexts={sourceTexts}
            newSourceContent={newSourceContent}
            setNewSourceContent={setNewSourceContent}
            editingSourceId={editingSourceId}
            editingContent={editingContent}
            setEditingContent={setEditingContent}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            handleAddSource={handleAddSource}
            handleDeleteSource={handleDeleteSource}
            handleEditSource={handleEditSource}
            handleSaveEdit={handleSaveEdit}
            handleCancelEdit={handleCancelEdit}
          />
        );
      default:
        return <div className="text-sm text-gray-500">Content for {activeTab}</div>;
    }
  };

  return (
    <div className="w-[300px] h-full bg-white/80 backdrop-blur-lg p-6 shadow-lg flex flex-col">
      <div className="flex-grow overflow-y-auto space-y-6 pb-4">
        <h2 className="text-lg font-semibold mb-4">Source Media</h2>
        <div className="flex items-center space-x-4 border-b border-gray-200/80 pb-2 mb-4">
          {(['Video', 'Audio', 'Images', 'Text'] as SourceType[]).map((tab) => (
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
        <div>{renderTabContent()}</div>
        
        {/* File Upload Dropbox */}
        <div className="pt-4 border-t border-gray-200/80">
          <FileUploadDropbox />
        </div>
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
  );
};

