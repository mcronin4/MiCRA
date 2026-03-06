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
  if (robot.pose === "thinking") {
    return `/robot-thinking-frame-${robot.thinkingFrame}.png`;
  }
  if (robot.pose === "dock") {
    return "/robot-full-body.png";
  }
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
  const speechScale = speech?.scale ?? 1;
  const robotSize = robot.pose === "thinking" || robot.pose === "dock" ? 112 : 133;

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
          data-testid="micrai-speech-bubble"
          className="absolute w-fit max-w-[min(460px,86vw)] whitespace-normal rounded-2xl border border-slate-200 bg-white/98 px-5 py-4 text-[16px] leading-[1.5] font-medium text-slate-700 shadow-sm animate-micrai-bubble-in"
          style={{
            left: speech.x,
            top: speech.y,
            transform:
              speech.direction === "left"
                ? `translate(-100%, -100%) scale(${speechScale})`
                : `translate(0, -100%) scale(${speechScale})`,
            transformOrigin:
              speech.direction === "left" ? "bottom right" : "bottom left",
          }}
        >
          {speech.text}
          <span
            className={`absolute bottom-5 w-0 h-0 border-y-[8px] border-y-transparent ${
              speech.direction === "left"
                ? "right-[-10px] border-l-[10px] border-l-white"
                : "left-[-10px] border-r-[10px] border-r-white"
            }`}
          />
        </div>
      )}

      {robot.visible && (
        <div
          data-testid="micrai-overlay-robot"
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
            width={robotSize}
            height={robotSize}
            className="select-none saturate-[1.35] brightness-[1.18] contrast-[1.22]"
            priority
          />
        </div>
      )}
    </div>
  );
};
