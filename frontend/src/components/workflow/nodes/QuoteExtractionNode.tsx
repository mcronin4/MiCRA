"use client";

import React, { useEffect, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import {
  extractQuotes,
  QuoteItem,
} from "@/lib/fastapi/quote-extraction";
import { NodeConfig } from "@/types/workflow";
import { TextQuote, X } from "lucide-react";

const config: NodeConfig = {
  type: "quote-extraction",
  label: "Quote Extraction",
  description: "Extract curated quotes from a transcript",
  inputs: [{ id: "transcript", label: "Transcript", type: "string" }],
  outputs: [{ id: "quotes", label: "Quotes", type: "json" }],
};

type QuoteStyle = "punchy" | "insightful" | "contrarian" | "emotional";

const quoteStyleOptions: { value: QuoteStyle; label: string }[] = [
  { value: "punchy", label: "Punchy" },
  { value: "insightful", label: "Insightful" },
  { value: "contrarian", label: "Contrarian" },
  { value: "emotional", label: "Emotional" },
];

const clampQuoteCount = (value: number) => {
  if (Number.isNaN(value)) return 10;
  return Math.max(1, Math.min(value, 30));
};

export function QuoteExtractionNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);

  const initialTranscript =
    typeof node?.inputs?.transcript === "string" ? node.inputs.transcript : "";
  const initialStyle =
    typeof node?.inputs?.style === "string"
      ? (node.inputs.style as QuoteStyle)
      : "punchy";
  const initialCount =
    typeof node?.inputs?.count === "number" ? node.inputs.count : 10;
  const initialQuotes = Array.isArray(node?.outputs?.quotes)
    ? (node?.outputs?.quotes as QuoteItem[])
    : [];

  const [transcript, setTranscript] = useState<string>(initialTranscript);
  const [quoteStyle, setQuoteStyle] = useState<QuoteStyle>(initialStyle);
  const [quoteCount, setQuoteCount] = useState<number>(
    clampQuoteCount(initialCount),
  );
  const [quotes, setQuotes] = useState<QuoteItem[]>(initialQuotes);
  const [showQuotes, setShowQuotes] = useState(false);

  useEffect(() => {
    if (!node) return;
    if (
      node.inputs.transcript !== transcript ||
      node.inputs.style !== quoteStyle ||
      node.inputs.count !== quoteCount
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          transcript,
          style: quoteStyle,
          count: quoteCount,
        },
      });
    }
  }, [transcript, quoteStyle, quoteCount, id, updateNode, node]);

  const handleExecute = async () => {
    updateNode(id, { status: "running", error: undefined });
    setQuotes([]);

    try {
      if (!transcript.trim()) {
        throw new Error("Please paste a transcript");
      }

      const response = await extractQuotes({
        transcript: transcript.trim(),
        style: quoteStyle,
        count: clampQuoteCount(quoteCount),
      });

      if (!response.success) {
        throw new Error(response.error || response.detail || "Quote extraction failed");
      }

      const nextQuotes = response.quotes || [];
      setQuotes(nextQuotes);
      updateNode(id, {
        status: "completed",
        outputs: { quotes: nextQuotes },
        inputs: {
          transcript,
          style: quoteStyle,
          count: quoteCount,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      updateNode(id, { status: "error", error: errorMessage });
    }
  };

  const previewQuote = quotes[0]?.text || "";

  return (
    <WorkflowNodeWrapper
      nodeId={id}
      config={config}
      onExecute={handleExecute}
      theme={nodeThemes.rose}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Transcript
          </label>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Paste transcript here..."
            rows={2}
            className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all placeholder:text-slate-400 max-h-24 overflow-y-auto"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Quote Style
            </label>
            <select
              value={quoteStyle}
              onChange={(event) => setQuoteStyle(event.target.value as QuoteStyle)}
              className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all"
            >
              {quoteStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Quote Count
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={quoteCount}
              onChange={(event) =>
                setQuoteCount(clampQuoteCount(Number(event.target.value)))
              }
              className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all"
            />
          </div>
        </div>

        {quotes.length > 0 ? (
          <div
            className="nodrag border border-slate-200 rounded-xl bg-white p-3 cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setShowQuotes(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setShowQuotes(true);
              }
            }}
            aria-label="Open quotes list"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wide">Quotes</span>
              <span>{quotes.length} total</span>
            </div>
            <div className="text-xs text-slate-600 truncate max-w-[260px]">
              {previewQuote}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              Click to view all extracted quotes
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
            <div className="p-2.5 rounded-xl bg-slate-100 w-fit mx-auto mb-2">
              <TextQuote size={18} className="text-slate-400" />
            </div>
            <p className="text-xs font-medium text-slate-600">
              No quotes yet
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Run extraction to populate quotes
            </p>
          </div>
        )}
      </div>

      {showQuotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setShowQuotes(false)}
            aria-hidden="true"
          />
          <div
            className="nodrag relative w-[90vw] max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Extracted Quotes
                </h4>
                <p className="text-xs text-slate-500">
                  {quotes.length} quotes
                </p>
              </div>
              <button
                type="button"
                className="nodrag p-2 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setShowQuotes(false)}
                aria-label="Close quotes"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-72px)] space-y-3">
              {quotes.map((quote, index) => (
                <div
                  key={`${quote.text}-${index}`}
                  className="border border-slate-200 rounded-xl p-3 bg-slate-50"
                >
                  <div className="text-[10px] text-slate-400 mb-1">
                    Quote {index + 1}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {quote.text}
                  </p>
                  {quote.reason && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      {quote.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </WorkflowNodeWrapper>
  );
}
