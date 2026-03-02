"use client";

import React from "react";
import Image from "next/image";
import type {
  MicrAIRobotState,
  MicrAISpeechBubble,
  MicrAITrailState,
} from "@/hooks/useMicrAIBuildPlayback";

interface MicrAIBuildOverlayProps {
  robot: MicrAIRobotState;
  speech: MicrAISpeechBubble | null;
  trail: MicrAITrailState;
}

function spriteForRobot(robot: MicrAIRobotState): string {
  const suffix = robot.variant === "default" ? "default" : robot.variant;
  if (robot.pose === "talk1") return `/robot-talk1-${suffix}.png`;
  if (robot.pose === "talk2") return `/robot-talk2-${suffix}.png`;
  return `/robot-smile-${suffix}.png`;
}

export const MicrAIBuildOverlay: React.FC<MicrAIBuildOverlayProps> = ({
  robot,
  speech,
  trail,
}) => {
  if (!robot.visible && !trail.visible && !speech) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <marker
            id="micrai-trail-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
          </marker>
        </defs>
        {trail.visible && (
          <path
            d={trail.path}
            stroke={trail.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.95}
            markerEnd="url(#micrai-trail-arrow)"
          />
        )}
      </svg>

      {speech && (
        <div
          className="absolute max-w-[620px] rounded-2xl border border-slate-200 bg-white/98 px-5 py-4 text-[16px] leading-[1.5] font-medium text-slate-700 shadow-sm animate-micrai-bubble-in"
          style={{
            left: speech.x,
            top: speech.y,
            transform: "translate(0, -100%)",
          }}
        >
          {speech.text}
        </div>
      )}

      {robot.visible && (
        <div
          className="absolute"
          style={{
            left: robot.x,
            top: robot.y,
            transform: `translate(-50%, -50%) scale(${robot.scale})`,
            transformOrigin: "center center",
          }}
        >
          <Image
            src={spriteForRobot(robot)}
            alt="MicrAI robot"
            width={133}
            height={133}
            className="select-none saturate-[1.35] brightness-[1.18] contrast-[1.22]"
            priority
          />
        </div>
      )}
    </div>
  );
};
