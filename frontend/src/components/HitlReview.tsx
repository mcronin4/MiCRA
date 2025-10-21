import React, { useState } from 'react';

interface HitlReviewProps {
  content: string;
  onApprove: () => void;
  onEdit: (newContent: string) => void;
  onSendBack: (reason: string) => void;
}

const HitlReview: React.FC<HitlReviewProps> = ({ content, onApprove, onEdit, onSendBack }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [sendBackReason, setSendBackReason] = useState('');

  const handleEdit = () => {
    onEdit(editedContent);
    setIsEditing(false);
  };

  const handleSendBack = () => {
    if (sendBackReason.trim()) {
      onSendBack(sendBackReason);
    }
  };

  return (
    <div className="mt-10">
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">Review Content</h3>
        </div>
        <div className="bg-white p-6">
          {isEditing ? (
            <textarea
              className="w-full h-48 px-5 py-4 bg-gray-50 border border-gray-300 rounded-xl text-base text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent transition-all duration-200 resize-none"
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
            />
          ) : (
            <pre className="text-[#1d1d1f] whitespace-pre-wrap text-sm leading-relaxed font-normal">
              {content}
            </pre>
          )}
        </div>
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div>
            {isEditing ? (
              <button
                onClick={handleEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium"
              >
                Save Edits
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all duration-200 text-sm font-medium"
              >
                Edit
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={onApprove}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium"
            >
              Approve
            </button>
            <div>
              <input
                type="text"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Reason for sending back..."
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
              />
              <button
                onClick={handleSendBack}
                disabled={!sendBackReason.trim()}
                className="ml-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium disabled:opacity-50"
              >
                Send Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HitlReview;
