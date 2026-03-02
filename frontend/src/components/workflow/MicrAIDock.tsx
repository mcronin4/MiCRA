"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import type { CopilotPlanMode, CopilotPlanResponse } from "@/lib/fastapi/workflows";
import { ChevronDown, Mic, SendHorizontal, Undo2, X } from "lucide-react";

interface MicrAIDockProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  mode: CopilotPlanMode;
  onModeChange: (mode: CopilotPlanMode) => void;
  isPlanning: boolean;
  error: string | null;
  pendingPlan: CopilotPlanResponse | null;
  onPlan: () => void;
  onApply: () => void;
  onDismissPlan: () => void;
  onUndoPatch: () => void;
  canUndoPatch: boolean;
  isPlaybackActive: boolean;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  onSkipPlayback: () => void;
  isVoiceRecording: boolean;
  isVoiceBusy: boolean;
  voiceLevel: number;
  onVoiceToggle: () => void;
  onClose: () => void;
}

export const MicrAIDock: React.FC<MicrAIDockProps> = ({
  prompt,
  onPromptChange,
  mode,
  onModeChange,
  isPlanning,
  error,
  pendingPlan,
  onPlan,
  onApply,
  onDismissPlan,
  onUndoPatch,
  canUndoPatch,
  isPlaybackActive,
  playbackSpeed,
  onPlaybackSpeedChange,
  onSkipPlayback,
  isVoiceRecording,
  isVoiceBusy,
  voiceLevel,
  onVoiceToggle,
  onClose,
}) => {
  const canPlan = prompt.trim().length > 0 && !isPlanning && !isPlaybackActive;
  const statusTone = useMemo(() => {
    if (!pendingPlan) return "text-slate-700";
    if (pendingPlan.status === "error") return "text-rose-600";
    if (pendingPlan.status === "clarify") return "text-amber-700";
    return "text-emerald-700";
  }, [pendingPlan]);

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-16 z-30 w-[min(680px,92vw)]">
      <div className="relative rounded-2xl border border-slate-200 bg-white overflow-visible">
        <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <Image
            src="/robot-smile-purple.png"
            alt="MicrAI"
            width={64}
            height={64}
            className="block saturate-[1.35] brightness-[1.2] contrast-[1.2]"
          />
        </div>

        <div className="h-12 flex items-center justify-between pl-9 pr-4 border-b border-slate-200 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="text-sm font-bold tracking-wide text-slate-800 uppercase leading-none">
              MicrAI
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as CopilotPlanMode)}
              className="h-8 text-[11px] border border-slate-200 rounded-lg px-2.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            >
              <option value="edit">Edit current</option>
              <option value="create">Create new</option>
            </select>
            <button
              onClick={onUndoPatch}
              disabled={!canUndoPatch || isPlaybackActive}
              className={`h-8 inline-flex items-center gap-1 rounded-lg px-2.5 text-[11px] border transition-colors ${
                canUndoPatch && !isPlaybackActive
                  ? "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                  : "border-slate-100 text-slate-300 cursor-not-allowed"
              }`}
            >
              <Undo2 size={11} />
              Undo patch
            </button>
            <select
              value={String(playbackSpeed)}
              onChange={(event) =>
                onPlaybackSpeedChange(Number(event.target.value))
              }
              className="h-8 text-[11px] border border-slate-200 rounded-lg px-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              title="Playback speed"
            >
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
            </select>
            <button
              onClick={onSkipPlayback}
              disabled={!isPlaybackActive}
              className={`h-8 inline-flex items-center gap-1 rounded-lg px-2.5 text-[11px] border transition-colors ${
                isPlaybackActive
                  ? "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                  : "border-slate-100 text-slate-300 cursor-not-allowed"
              }`}
              title="Skip build animation"
            >
              Skip
            </button>
            <button
              onClick={onClose}
              disabled={isPlaybackActive}
              className={`h-8 w-8 inline-flex items-center justify-center rounded-lg ${
                isPlaybackActive
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Close MicrAI"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="h-12 flex items-center gap-2 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-indigo-50 to-purple-50 px-3">
            <button
              type="button"
              onClick={onVoiceToggle}
              disabled={isVoiceBusy || isPlaybackActive}
              className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center ${
                isVoiceRecording
                  ? "border-rose-300 bg-rose-50 text-rose-600"
                  : "border-violet-200 bg-white/90 text-slate-500"
              } ${
                isVoiceBusy || isPlaybackActive
                  ? "opacity-60 cursor-not-allowed"
                  : ""
              }`}
              title={isVoiceRecording ? "Stop voice input" : "Start voice input"}
            >
              <Mic size={12} />
            </button>
            {isVoiceRecording && (
              <div className="flex items-end gap-[2px] h-4 w-8">
                {[0, 1, 2, 3].map((idx) => {
                  const scale = Math.max(0.2, 1 - Math.abs(idx - 1.5) * 0.24);
                  const h = 3 + voiceLevel * 11 * scale;
                  return (
                    <span
                      key={idx}
                      className="w-[3px] rounded-full bg-violet-500"
                      style={{ height: `${h}px` }}
                    />
                  );
                })}
              </div>
            )}
            <input
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Plan your workflow..."
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-violet-500/55 text-slate-800"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canPlan) onPlan();
                }
              }}
            />
            <button
              onClick={onPlan}
              disabled={!canPlan || isPlaybackActive}
              className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors ${
                canPlan && !isPlaybackActive
                  ? "bg-indigo-500 text-white hover:bg-indigo-600"
                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
              }`}
              title="Plan with MicrAI"
            >
              <SendHorizontal size={13} />
            </button>
          </div>

          {(error || pendingPlan) && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
              {error && <div className="text-rose-600">{error}</div>}
              {pendingPlan && (
                <div className="space-y-2">
                  <div className={`font-medium text-[12px] ${statusTone}`}>
                    {pendingPlan.summary}
                  </div>
                  {pendingPlan.clarification_question && (
                    <div className="text-amber-700 text-[12px]">
                      {pendingPlan.clarification_question}
                    </div>
                  )}
                  <div className="flex items-center justify-start gap-2">
                    <button
                      onClick={onApply}
                      disabled={
                        isPlaybackActive ||
                        pendingPlan.status !== "ready" ||
                        !pendingPlan.workflow_data
                      }
                      className={`rounded-lg px-3 py-1 text-[11px] font-medium transition-colors ${
                        !isPlaybackActive &&
                        pendingPlan.status === "ready" &&
                        pendingPlan.workflow_data
                          ? "bg-indigo-500 text-white hover:bg-indigo-600"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      Apply
                    </button>
                    <button
                      onClick={onDismissPlan}
                      className="rounded-lg px-2.5 py-1 text-[11px] border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1 transition-colors"
                    >
                      <X size={11} />
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
