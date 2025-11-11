import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, editedContent]);

  const handleEdit = () => {
    onEdit(editedContent);
    setIsEditing(false);
  };

  const handleSendBack = () => {
    if (sendBackReason.trim()) {
      onSendBack(sendBackReason);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };


  return (
    <div className="mt-10 max-w-2xl mx-auto">
      <div className="border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Review Content</h3>
        </div>
        <div className="bg-white p-6">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-base text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none overflow-hidden"
              value={editedContent}
              onChange={handleContentChange}
              rows={1}
            />
          ) : (
            <pre className="text-gray-800 whitespace-pre-wrap text-base leading-relaxed font-normal">
              {content}
            </pre>
          )}
        </div>
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div>
            {isEditing ? (
              <Button onClick={handleEdit}>
                Save Edits
              </Button>
            ) : (
              <Button onClick={() => setIsEditing(true)} variant="secondary">
                Edit
              </Button>
            )}
          </div>
          <div className="flex items-center space-x-2">
             <input
                type="text"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Reason for sending back..."
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
              />
            <Button onClick={onApprove} variant="default" className="bg-green-500 hover:bg-green-600">
              Approve
            </Button>
            <Button
              onClick={handleSendBack}
              disabled={!sendBackReason.trim()}
              variant="destructive"
            >
              Send Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HitlReview;
