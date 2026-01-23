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
} from "lucide-react";
import { FaTiktok } from "react-icons/fa";
import type { NodeType } from "../final-review/types";

interface NodeSidebarProps {
  onAddNode: (nodeType: NodeType) => void;
}

const nodeCategories = [
  {
    name: "Output",
    icon: Send,
    nodes: [
      { type: "LinkedIn" as NodeType, label: "LinkedIn", icon: Linkedin },
      { type: "TikTok" as NodeType, label: "TikTok", icon: FaTiktok },
      { type: "Email" as NodeType, label: "Email", icon: Mail },
    ],
  },
  {
    name: "AI",
    icon: Wand2,
    nodes: [
      { type: "TextGeneration" as NodeType, label: "Text Gen", icon: FileText },
      {
        type: "ImageGeneration" as NodeType,
        label: "Image Gen",
        icon: Sparkles,
      },
      { type: "ImageMatching" as NodeType, label: "Matching", icon: ImageIcon },
    ],
  },
];

export const NodeSidebar: React.FC<NodeSidebarProps> = ({ onAddNode }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <div
      className={`h-full bg-white border-r border-gray-100 flex flex-col transition-all duration-300 ${
        isExpanded ? "w-56" : "w-14"
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => {
        setIsExpanded(false);
        setExpandedCategory(null);
      }}
    >
      {/* Node Categories */}
      <div className="flex-1 py-4 overflow-y-auto">
        <div className="flex flex-col gap-1 px-2">
          {nodeCategories.map((category) => (
            <div key={category.name}>
              <button
                onClick={() =>
                  setExpandedCategory(
                    expandedCategory === category.name ? null : category.name,
                  )
                }
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 ${
                  expandedCategory === category.name ? "bg-gray-50" : ""
                }`}
              >
                <category.icon size={20} className="flex-shrink-0" />
                {isExpanded && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">
                      {category.name}
                    </span>
                    <ChevronRight
                      size={16}
                      className={`transition-transform ${
                        expandedCategory === category.name ? "rotate-90" : ""
                      }`}
                    />
                  </>
                )}
              </button>

              {/* Expanded nodes */}
              {isExpanded && expandedCategory === category.name && (
                <div className="ml-4 mt-1 space-y-1">
                  {category.nodes.map((node) => (
                    <button
                      key={node.type}
                      onClick={() => onAddNode(node.type)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600 text-sm"
                    >
                      <node.icon size={16} />
                      <span>{node.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
