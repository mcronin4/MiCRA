"use client";

import React, { useState } from "react";
import {
  Send,
  Wand2,
  ChevronRight,
  Linkedin,
  Mail,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Film,
  Mic,
  Flag,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  FolderOpen,
  Music,
  Video,
  TextQuote,
} from "lucide-react";
import { FaTiktok } from "react-icons/fa";
import type { NodeType } from "../final-review/types";
import { ImageBucketPanel } from "./ImageBucketPanel";

interface NodeSidebarProps {
  onAddNode: (nodeType: NodeType) => void;
}

const nodeCategories = [
  {
    name: "Input Buckets",
    icon: FolderOpen,
    nodes: [
      { type: "ImageBucket" as NodeType, label: "Image Bucket", icon: ImageIcon },
      { type: "AudioBucket" as NodeType, label: "Audio Bucket", icon: Music },
      { type: "VideoBucket" as NodeType, label: "Video Bucket", icon: Video },
      { type: "TextBucket" as NodeType, label: "Text Bucket", icon: FileText },
    ],
  },
  {
    name: "Flow Control",
    icon: GitBranch,
    nodes: [
      { type: "End" as NodeType, label: "End Flow", icon: Flag },
    ],
  },
  {
    name: "Outputs",
    icon: Send,
    nodes: [
      { type: "LinkedIn" as NodeType, label: "LinkedIn Post", icon: Linkedin },
      { type: "TikTok" as NodeType, label: "TikTok Video", icon: FaTiktok },
      { type: "Email" as NodeType, label: "Send Email", icon: Mail },
    ],
  },
  {
    name: "AI Actions",
    icon: Wand2,
    nodes: [
      {
        type: "TextGeneration" as NodeType,
        label: "Generate Text",
        icon: FileText,
      },
      {
        type: "Transcription" as NodeType,
        label: "Transcribe Media",
        icon: Mic,
      },
      {
        type: "ImageGeneration" as NodeType,
        label: "Generate Image",
        icon: Sparkles,
      },
      {
        type: "ImageExtraction" as NodeType,
        label: "Image Extraction",
        icon: Film,
      },
      {
        type: "QuoteExtraction" as NodeType,
        label: "Quote Extraction",
        icon: TextQuote,
      },
      {
        type: "ImageMatching" as NodeType,
        label: "Match VLM",
        icon: ImageIcon,
      },
    ],
  },
];

export const NodeSidebar: React.FC<NodeSidebarProps> = ({ onAddNode }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    "AI Actions",
  ); // Default expand AI

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      // Re-expanding
    } else {
      // Collapsing
      setExpandedCategory(null);
    }
  };

  const handleCategoryClick = (categoryName: string) => {
    if (!isExpanded) {
      setIsExpanded(true);
      setExpandedCategory(categoryName);
    } else {
      setExpandedCategory(
        expandedCategory === categoryName ? null : categoryName,
      );
    }
  };

  return (
    <div
      className={`h-full bg-slate-50 border-r border-slate-200 flex flex-col transition-all duration-300 relative select-none ${
        isExpanded ? "w-64" : "w-16"
      }`}
    >
      {/* Sidebar Header */}
      <div
        className={`h-14 flex items-center border-b border-slate-200 bg-white ${
          isExpanded ? "justify-between px-4" : "justify-center"
        }`}
      >
        {isExpanded && (
          <div className="flex items-center gap-2 text-slate-800 font-semibold tracking-tight">
            <Layers size={18} className="text-indigo-600" />
            <span>Nodes</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all"
          title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isExpanded ? (
            <PanelLeftClose size={18} />
          ) : (
            <PanelLeftOpen size={18} />
          )}
        </button>
      </div>

      {/* Node Categories List */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="flex flex-col gap-1 px-2">
          {nodeCategories.map((category) => (
            <div key={category.name} className="group">
              <button
                onClick={() => handleCategoryClick(category.name)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                  ${!isExpanded ? "justify-center px-0 tooltip-container" : ""}
                  ${
                    expandedCategory === category.name
                      ? "bg-white shadow-sm ring-1 ring-slate-200 text-indigo-900"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/50"
                  }
                `}
                title={!isExpanded ? category.name : undefined}
              >
                <div
                  className={`
                  p-1.5 rounded-md transition-colors
                  ${expandedCategory === category.name && isExpanded ? "bg-indigo-50 text-indigo-600" : "text-slate-500 group-hover:text-slate-700"}
                `}
                >
                  <category.icon size={18} strokeWidth={2} />
                </div>

                {isExpanded && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">
                      {category.name}
                    </span>
                    <ChevronRight
                      size={14}
                      className={`text-slate-400 transition-transform duration-200 ${
                        expandedCategory === category.name
                          ? "rotate-90 text-indigo-500"
                          : ""
                      }`}
                    />
                  </>
                )}
              </button>

              {/* Sub-items (Nodes) */}
              {isExpanded && expandedCategory === category.name && (
                <div className="ml-4 pl-4 border-l border-slate-200 space-y-1 my-1 py-1">
                  {category.nodes.map((node) => (
                    <button
                      key={node.type}
                      onClick={() => onAddNode(node.type)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-100 transition-all text-slate-600 hover:text-indigo-600 text-[13px] group/item"
                    >
                      <node.icon
                        size={15}
                        className="text-slate-400 group-hover/item:text-indigo-500 transition-colors"
                      />
                      <span className="font-medium">{node.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Media / Image Bucket Footer */}
      {isExpanded && (
        <div className="border-t border-slate-200 bg-white">
          <ImageBucketPanel />
        </div>
      )}
    </div>
  );
};
