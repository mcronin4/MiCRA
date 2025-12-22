import React from 'react';
import type { SourceText } from '../types';

interface TextTabProps {
  sourceTexts: SourceText[];
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

export const TextTab: React.FC<TextTabProps> = ({
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
};

