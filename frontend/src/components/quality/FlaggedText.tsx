'use client';

import React, { useState, useRef, useEffect } from 'react';
import { QualityFlag, FLAG_TYPE_CONFIG } from '@/types/quality';
import { FlagPopover } from './FlagPopover';

interface FlaggedTextProps {
  content: string;
  flags: QualityFlag[];
  onApproveFlag: (flagId: string) => void;
  onEditFlag: (flagId: string, newText: string) => void;
  onSetStandard: (flagId: string, term: string, correction: string) => void;
  onRequestRegeneration: (flagId: string) => void;
  isEditable?: boolean;
}

interface TextSegment {
  text: string;
  flag: QualityFlag | null;
  startIndex: number;
  endIndex: number;
}

export const FlaggedText: React.FC<FlaggedTextProps> = ({
  content,
  flags,
  onApproveFlag,
  onEditFlag,
  onSetStandard,
  onRequestRegeneration,
  isEditable = false,
}) => {
  const [activeFlagId, setActiveFlagId] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort flags by startIndex - include pending AND edited flags (so users can re-edit)
  // Exclude only 'approved' flags as those are confirmed correct
  const activeFlags = flags
    .filter(f => f.status === 'pending' || f.status === 'edited')
    .sort((a, b) => a.startIndex - b.startIndex);

  // Build segments of text with/without flags
  const segments: TextSegment[] = [];
  let currentIndex = 0;

  for (const flag of activeFlags) {
    // Skip if positions are invalid
    if (flag.startIndex < 0 || flag.endIndex < 0 || flag.startIndex >= content.length) {
      continue;
    }

    // Add non-flagged text before this flag
    if (flag.startIndex > currentIndex) {
      segments.push({
        text: content.slice(currentIndex, flag.startIndex),
        flag: null,
        startIndex: currentIndex,
        endIndex: flag.startIndex,
      });
    }

    // Add flagged text (handle edge cases where endIndex might be beyond content)
    const endIdx = Math.min(flag.endIndex, content.length);
    segments.push({
      text: content.slice(flag.startIndex, endIdx),
      flag,
      startIndex: flag.startIndex,
      endIndex: endIdx,
    });

    currentIndex = endIdx;
  }

  // Add remaining non-flagged text
  if (currentIndex < content.length) {
    segments.push({
      text: content.slice(currentIndex),
      flag: null,
      startIndex: currentIndex,
      endIndex: content.length,
    });
  }

  const handleFlagClick = (flag: QualityFlag, event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    
    if (containerRect) {
      setPopoverPosition({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.bottom - containerRect.top + 8,
      });
    }
    setActiveFlagId(flag.id);
  };

  const handleClosePopover = () => {
    setActiveFlagId(null);
    setPopoverPosition(null);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleClosePopover();
      }
    };

    if (activeFlagId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeFlagId]);

  const activeFlag = flags.find(f => f.id === activeFlagId);

  // Get styling based on flag status
  const getFlagStyles = (flag: QualityFlag) => {
    const config = FLAG_TYPE_CONFIG[flag.type];
    
    if (flag.status === 'edited') {
      // Edited flags: green tint, subtle styling, still clickable for re-editing
      return {
        bg: 'bg-green-100/60',
        text: 'text-green-700',
        border: 'border-green-300',
        title: `✓ Edited (click to change): ${flag.text}`,
      };
    }
    
    // Pending flags: normal styling
    return {
      bg: config.bgColor,
      text: config.color,
      border: config.borderColor,
      title: `${config.label}: ${flag.reasoning}`,
    };
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="whitespace-pre-wrap leading-relaxed">
        {segments.map((segment, index) => {
          if (segment.flag) {
            const styles = getFlagStyles(segment.flag);
            return (
              <span
                key={`${segment.startIndex}-${index}`}
                onClick={(e) => handleFlagClick(segment.flag!, e)}
                className={`
                  ${styles.bg} 
                  ${styles.text}
                  cursor-pointer 
                  rounded-sm 
                  px-0.5 
                  border-b-2 
                  ${styles.border}
                  hover:opacity-80
                  transition-opacity
                  relative
                  inline
                `}
                title={styles.title}
              >
                {segment.text}
              </span>
            );
          }
          return <span key={`${segment.startIndex}-${index}`}>{segment.text}</span>;
        })}
      </div>

      {/* Popover for active flag */}
      {activeFlag && popoverPosition && (
        <FlagPopover
          flag={activeFlag}
          position={popoverPosition}
          onApprove={() => {
            onApproveFlag(activeFlag.id);
            handleClosePopover();
          }}
          onEdit={(newText) => {
            onEditFlag(activeFlag.id, newText);
            handleClosePopover();
          }}
          onSetStandard={(term, correction) => {
            onSetStandard(activeFlag.id, term, correction);
            handleClosePopover();
          }}
          onRegenerate={() => {
            onRequestRegeneration(activeFlag.id);
            handleClosePopover();
          }}
          onClose={handleClosePopover}
          isEditable={isEditable}
        />
      )}
    </div>
  );
};

export default FlaggedText;
