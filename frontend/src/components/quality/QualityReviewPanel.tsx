'use client';

import React, { useState } from 'react';
import { QualityFlag, FlaggedContent, FLAG_TYPE_CONFIG, FlagType } from '@/types/quality';
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight, Sparkles, Filter } from 'lucide-react';

interface QualityReviewPanelProps {
  flaggedContents: FlaggedContent[];
  onFlagClick: (nodeId: string, flagId: string) => void;
  onApproveAll: (nodeId: string) => void;
  onApproveFlag: (nodeId: string, flagId: string) => void;
}

export const QualityReviewPanel: React.FC<QualityReviewPanelProps> = ({
  flaggedContents,
  onFlagClick,
  onApproveAll,
  onApproveFlag,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<FlagType | 'all'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Calculate total flags across all content
  const totalFlags = flaggedContents.reduce(
    (acc, fc) => acc + fc.flags.filter(f => f.status === 'pending').length,
    0
  );

  const resolvedFlags = flaggedContents.reduce(
    (acc, fc) => acc + fc.flags.filter(f => f.status !== 'pending').length,
    0
  );

  // Group flags by type for summary
  const flagsByType = flaggedContents.reduce((acc, fc) => {
    fc.flags.filter(f => f.status === 'pending').forEach(flag => {
      acc[flag.type] = (acc[flag.type] || 0) + 1;
    });
    return acc;
  }, {} as Record<FlagType, number>);

  const getNodeTypeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'LinkedIn': return '💼';
      case 'Email': return '✉️';
      case 'TikTok': return '🎵';
      default: return '📄';
    }
  };

  const getFilteredFlags = (flags: QualityFlag[]) => {
    return flags.filter(f => 
      f.status === 'pending' && 
      (filterType === 'all' || f.type === filterType)
    );
  };

  const hasAnyFlags = flaggedContents.some(fc => fc.flags.some(f => f.status === 'pending'));

  return (
    <div className="space-y-4">
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles size={18} className="text-blue-500" />
          Quality Review
        </h2>
        {hasAnyFlags && (
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-1 rounded-md"
            >
              <Filter size={12} />
              Filter
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-32">
                <button
                  onClick={() => { setFilterType('all'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${filterType === 'all' ? 'bg-blue-50 text-blue-700' : ''}`}
                >
                  All Types
                </button>
                {(Object.keys(FLAG_TYPE_CONFIG) as FlagType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => { setFilterType(type); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${filterType === type ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    <span>{FLAG_TYPE_CONFIG[type].icon}</span>
                    {FLAG_TYPE_CONFIG[type].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status summary bar */}
      {hasAnyFlags ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                {totalFlags} item{totalFlags !== 1 ? 's' : ''} need review
              </span>
            </div>
            {resolvedFlags > 0 && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                {resolvedFlags} resolved
              </span>
            )}
          </div>
          
          {/* Flag type breakdown */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(flagsByType) as [FlagType, number][]).map(([type, count]) => (
              <span
                key={type}
                className={`text-xs px-2 py-0.5 rounded-full ${FLAG_TYPE_CONFIG[type].bgColor} ${FLAG_TYPE_CONFIG[type].color}`}
              >
                {FLAG_TYPE_CONFIG[type].icon} {count}
              </span>
            ))}
          </div>
        </div>
      ) : flaggedContents.length > 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={16} className="text-green-600" />
          <span className="text-sm text-green-800">All items reviewed!</span>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-500">No content to review yet</p>
          <p className="text-xs text-gray-400 mt-1">Generate content to see quality checks</p>
        </div>
      )}

      {/* Content-by-content breakdown */}
      {flaggedContents.map(fc => {
        const filteredFlags = getFilteredFlags(fc.flags);
        const isExpanded = expandedNodes.has(fc.nodeId);
        const pendingCount = fc.flags.filter(f => f.status === 'pending').length;
        
        if (filteredFlags.length === 0 && filterType !== 'all') return null;

        return (
          <div key={fc.nodeId} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Content header */}
            <button
              onClick={() => toggleNode(fc.nodeId)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-base">{getNodeTypeIcon(fc.nodeType)}</span>
                <span className="text-sm font-medium text-gray-700">{fc.nodeType}</span>
              </div>
              <div className="flex items-center gap-2">
                {fc.isChecking ? (
                  <span className="text-xs text-blue-500 animate-pulse">Checking...</span>
                ) : pendingCount > 0 ? (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {pendingCount} flag{pendingCount !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <CheckCircle size={14} className="text-green-500" />
                )}
              </div>
            </button>

            {/* Expanded flag list */}
            {isExpanded && (
              <div className="p-2 space-y-2 bg-white">
                {filteredFlags.length > 0 ? (
                  <>
                    {/* Approve all button */}
                    {pendingCount > 1 && (
                      <button
                        onClick={() => onApproveAll(fc.nodeId)}
                        className="w-full text-xs text-green-600 hover:text-green-700 hover:bg-green-50 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle size={12} />
                        Approve All ({pendingCount})
                      </button>
                    )}
                    
                    {filteredFlags.map(flag => {
                      const config = FLAG_TYPE_CONFIG[flag.type];
                      return (
                        <div
                          key={flag.id}
                          className="group flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => onFlagClick(fc.nodeId, flag.id)}
                        >
                          <span className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.color} shrink-0`}>
                            {config.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              &ldquo;{flag.text}&rdquo;
                            </p>
                            <p className="text-xs text-gray-500 line-clamp-1">{flag.reasoning}</p>
                            {flag.suggestion && (
                              <p className="text-xs text-green-600 mt-0.5">
                                → {flag.suggestion}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onApproveFlag(fc.nodeId, flag.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-green-500 hover:text-green-700 p-1 transition-opacity"
                            title="Approve"
                          >
                            <CheckCircle size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="text-xs text-gray-500 text-center py-2">
                    {filterType !== 'all' ? 'No flags of this type' : 'All flags resolved'}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QualityReviewPanel;


