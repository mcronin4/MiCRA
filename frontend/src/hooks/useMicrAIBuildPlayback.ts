import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import { Position, getBezierPath } from "@xyflow/react";
import type {
  CopilotBuildStep,
  CopilotPlanMode,
  SavedWorkflowData,
  SavedWorkflowNode,
} from "@/lib/fastapi/workflows";
import { getNodeSpec } from "@/lib/nodeRegistry";
import { synthesizeMicrAIVoice } from "@/lib/fastapi/voice";

type PlaybackStatus = "idle" | "running" | "skipping" | "done" | "error";
type RobotPose = "smile" | "talk1" | "talk2";
type RobotVariant = "default" | "green" | "blue" | "purple" | "yellow";

interface Point {
  x: number;
  y: number;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface CubicCurve {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
}

interface TrailModel {
  visible: boolean;
  cubic: CubicCurve | null;
  t: number;
  color: string;
}

export interface MicrAIRobotState {
  visible: boolean;
  x: number;
  y: number;
  pose: RobotPose;
  variant: RobotVariant;
  scale: number;
}

export interface MicrAISpeechBubble {
  text: string;
  x: number;
  y: number;
}

export interface MicrAITrailState {
  visible: boolean;
  path: string;
  color: string;
}

interface StartPlaybackArgs {
  mode: CopilotPlanMode;
  steps: CopilotBuildStep[];
  closingNarration?: string | null;
  currentWorkflow: SavedWorkflowData;
  finalWorkflow: SavedWorkflowData;
  canvasContainerRef: RefObject<HTMLDivElement | null>;
  getViewport?: () => { x: number; y: number; zoom: number } | null;
  applyWorkflow: (workflowData: SavedWorkflowData) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

const EDGE_COLORS: Record<NonNullable<CopilotBuildStep["runtime_type"]>, string> = {
  Text: "#22c55e",
  ImageRef: "#3b82f6",
  AudioRef: "#a855f7",
  VideoRef: "#eab308",
};

const EDGE_VARIANTS: Record<NonNullable<CopilotBuildStep["runtime_type"]>, RobotVariant> = {
  Text: "green",
  ImageRef: "blue",
  AudioRef: "purple",
  VideoRef: "yellow",
};

const NODE_FALLBACK_SIZE: Record<string, { width: number; height: number }> = {
  ImageBucket: { width: 260, height: 170 },
  AudioBucket: { width: 260, height: 170 },
  VideoBucket: { width: 260, height: 170 },
  TextBucket: { width: 260, height: 170 },
  End: { width: 220, height: 180 },
  TextGeneration: { width: 500, height: 250 },
  ImageMatching: { width: 500, height: 280 },
  ImageExtraction: { width: 500, height: 320 },
  Transcription: { width: 500, height: 260 },
  QuoteExtraction: { width: 500, height: 280 },
  default: { width: 380, height: 240 },
};

const DEFAULT_ROBOT: MicrAIRobotState = {
  visible: false,
  x: 64,
  y: 64,
  pose: "smile",
  variant: "purple",
  scale: 0.95,
};

const DEFAULT_TRAIL: MicrAITrailState = {
  visible: false,
  path: "",
  color: EDGE_COLORS.Text,
};

const FALLBACK_CLOSING_LINE =
  "All set. Your workflow is wired and ready, so go ahead and run it.";

class SkipPlaybackError extends Error {
  constructor() {
    super("Playback skipped");
  }
}

function cloneWorkflowData(workflowData: SavedWorkflowData): SavedWorkflowData {
  return {
    nodes: workflowData.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: node.data ? { ...node.data } : undefined,
      style: node.style ? { ...node.style } : undefined,
    })),
    edges: workflowData.edges.map((edge) => ({ ...edge })),
  };
}

function cloneNode(node: SavedWorkflowNode): SavedWorkflowNode {
  return {
    ...node,
    position: { ...node.position },
    data: node.data ? { ...node.data } : undefined,
    style: node.style ? { ...node.style } : undefined,
  };
}

function edgeKey(edge: {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}): string {
  return `${edge.source}::${edge.sourceHandle ?? ""}=>${edge.target}::${edge.targetHandle ?? ""}`;
}

function runtimeToColor(runtimeType: CopilotBuildStep["runtime_type"] | null | undefined): string {
  if (!runtimeType) return EDGE_COLORS.Text;
  return EDGE_COLORS[runtimeType] ?? EDGE_COLORS.Text;
}

function runtimeToVariant(runtimeType: CopilotBuildStep["runtime_type"] | null | undefined): RobotVariant {
  if (!runtimeType) return "purple";
  return EDGE_VARIANTS[runtimeType] ?? "purple";
}

function isPrimitiveRuntimeType(
  value: string | null | undefined
): value is NonNullable<CopilotBuildStep["runtime_type"]> {
  return value === "Text" || value === "ImageRef" || value === "AudioRef" || value === "VideoRef";
}

function resolveRuntimeTypeForStep(
  step: CopilotBuildStep,
  nodesById: Map<string, SavedWorkflowNode>
): NonNullable<CopilotBuildStep["runtime_type"]> | null {
  if (isPrimitiveRuntimeType(step.runtime_type ?? null)) {
    return step.runtime_type;
  }
  const sourceNodeId = String(step.source_node_id || "").trim();
  if (!sourceNodeId) return null;
  const sourceNode = nodesById.get(sourceNodeId);
  if (!sourceNode) return null;
  const spec = getNodeSpec(sourceNode.type);
  if (!spec || !spec.outputs.length) return null;
  const preferredHandle = String(step.source_handle || "").trim();
  const selectedOutput =
    spec.outputs.find((port) => port.key === preferredHandle) ?? spec.outputs[0];
  if (!selectedOutput) return null;
  const runtime = String(selectedOutput.runtime_type || "").trim();
  if (isPrimitiveRuntimeType(runtime)) {
    return runtime;
  }
  return null;
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cubicOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function cubicAt(curve: CubicCurve, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x:
      curve.p0.x * mt2 * mt +
      3 * curve.p1.x * mt2 * t +
      3 * curve.p2.x * mt * t2 +
      curve.p3.x * t2 * t,
    y:
      curve.p0.y * mt2 * mt +
      3 * curve.p1.y * mt2 * t +
      3 * curve.p2.y * mt * t2 +
      curve.p3.y * t2 * t,
  };
}

function cubicSubsegment(curve: CubicCurve, t: number): CubicCurve {
  const q0 = lerpPoint(curve.p0, curve.p1, t);
  const q1 = lerpPoint(curve.p1, curve.p2, t);
  const q2 = lerpPoint(curve.p2, curve.p3, t);
  const r0 = lerpPoint(q0, q1, t);
  const r1 = lerpPoint(q1, q2, t);
  const s = lerpPoint(r0, r1, t);
  return { p0: curve.p0, p1: q0, p2: r0, p3: s };
}

function cubicToPath(curve: CubicCurve): string {
  return `M ${curve.p0.x},${curve.p0.y} C ${curve.p1.x},${curve.p1.y} ${curve.p2.x},${curve.p2.y} ${curve.p3.x},${curve.p3.y}`;
}

function flowToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

function screenToFlow(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / Math.max(viewport.zoom, 0.001),
    y: (point.y - viewport.y) / Math.max(viewport.zoom, 0.001),
  };
}

function parseBezierCurve(path: string): CubicCurve | null {
  const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map((n) => Number(n));
  if (!nums || nums.length < 8 || nums.some((n) => Number.isNaN(n))) {
    return null;
  }
  return {
    p0: { x: nums[0], y: nums[1] },
    p1: { x: nums[2], y: nums[3] },
    p2: { x: nums[4], y: nums[5] },
    p3: { x: nums[6], y: nums[7] },
  };
}

function buildConnectorCurve(source: Point, target: Point): CubicCurve {
  const [path] = getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: Position.Right,
    targetX: target.x,
    targetY: target.y,
    targetPosition: Position.Left,
    curvature: 0.25,
  });
  const parsed = parseBezierCurve(path);
  if (parsed) return parsed;

  const dx = Math.max(Math.abs(target.x - source.x), 80);
  const offset = dx * 0.35;
  return {
    p0: source,
    p1: { x: source.x + offset, y: source.y },
    p2: { x: target.x - offset, y: target.y },
    p3: target,
  };
}

function parseViewportFromDom(container: HTMLDivElement | null): Viewport | null {
  if (!container) return null;
  const viewportEl = container.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewportEl) return null;
  const transform = window.getComputedStyle(viewportEl).transform;
  if (!transform || transform === "none") {
    return { x: 0, y: 0, zoom: 1 };
  }

  const matrix = transform.match(/^matrix\((.+)\)$/);
  if (matrix) {
    const values = matrix[1].split(",").map((v) => Number(v.trim()));
    if (values.length === 6 && values.every((v) => Number.isFinite(v))) {
      return { x: values[4] ?? 0, y: values[5] ?? 0, zoom: values[0] ?? 1 };
    }
  }

  const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3d) {
    const values = matrix3d[1].split(",").map((v) => Number(v.trim()));
    if (values.length === 16 && values.every((v) => Number.isFinite(v))) {
      return { x: values[12] ?? 0, y: values[13] ?? 0, zoom: values[0] ?? 1 };
    }
  }
  return { x: 0, y: 0, zoom: 1 };
}

function nextAnimationFrame(count = 1): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(1, count);
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function isVoiceDebugEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_MICRAI_VOICE_DEBUG || "")
      .toLowerCase()
      .trim() === "true"
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, timeoutMs);
    promise
      .then((value) => {
        if (done) return;
        done = true;
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch(() => {
        if (done) return;
        done = true;
        window.clearTimeout(timeout);
        resolve(fallback);
      });
  });
}

export function useMicrAIBuildPlayback() {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [robot, setRobot] = useState<MicrAIRobotState>(DEFAULT_ROBOT);
  const [speech, setSpeech] = useState<MicrAISpeechBubble | null>(null);
  const [trail, setTrail] = useState<MicrAITrailState>(DEFAULT_TRAIL);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const speedRef = useRef(1);

  const runIdRef = useRef(0);
  const skipRequestedRef = useRef(false);
  const renderLoopRef = useRef<number | null>(null);
  const speechIntervalRef = useRef<number | null>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationObjectUrlRef = useRef<string | null>(null);
  const narrationAudioCtxRef = useRef<AudioContext | null>(null);
  const narrationAudioRafRef = useRef<number | null>(null);

  const robotFlowRef = useRef<Point>({ x: 64, y: 64 });
  const trailModelRef = useRef<TrailModel>({
    visible: false,
    cubic: null,
    t: 0,
    color: EDGE_COLORS.Text,
  });

  const setRobotState = useCallback((updater: MicrAIRobotState | ((prev: MicrAIRobotState) => MicrAIRobotState)) => {
    setRobot((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  const clearSpeechInterval = useCallback(() => {
    if (speechIntervalRef.current !== null) {
      window.clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }
  }, []);

  const clearNarrationAudio = useCallback(() => {
    if (narrationAudioRafRef.current !== null) {
      cancelAnimationFrame(narrationAudioRafRef.current);
      narrationAudioRafRef.current = null;
    }
    if (narrationAudioCtxRef.current) {
      try {
        void narrationAudioCtxRef.current.close();
      } catch {
        // no-op
      }
      narrationAudioCtxRef.current = null;
    }
    if (narrationAudioRef.current) {
      try {
        narrationAudioRef.current.pause();
      } catch {
        // no-op
      }
      narrationAudioRef.current.src = "";
      narrationAudioRef.current = null;
    }
    if (narrationObjectUrlRef.current) {
      URL.revokeObjectURL(narrationObjectUrlRef.current);
      narrationObjectUrlRef.current = null;
    }
  }, []);

  const stopRenderLoop = useCallback(() => {
    if (renderLoopRef.current !== null) {
      cancelAnimationFrame(renderLoopRef.current);
      renderLoopRef.current = null;
    }
  }, []);

  const resetVisuals = useCallback(() => {
    stopRenderLoop();
    clearSpeechInterval();
    clearNarrationAudio();
    trailModelRef.current = { visible: false, cubic: null, t: 0, color: EDGE_COLORS.Text };
    setSpeech(null);
    setTrail(DEFAULT_TRAIL);
    setRobotState(DEFAULT_ROBOT);
  }, [clearNarrationAudio, clearSpeechInterval, setRobotState, stopRenderLoop]);

  const throwIfCancelled = useCallback((runId: number) => {
    if (runIdRef.current !== runId) {
      throw new Error("Playback canceled");
    }
    if (skipRequestedRef.current) {
      throw new SkipPlaybackError();
    }
  }, []);

  const sleep = useCallback(
    async (ms: number, runId: number) => {
      const duration = Math.max(0, ms / Math.max(speedRef.current, 0.1));
      if (duration <= 0) {
        throwIfCancelled(runId);
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, duration));
      throwIfCancelled(runId);
    },
    [throwIfCancelled]
  );

  const getViewport = useCallback(
    (
      containerRef: RefObject<HTMLDivElement | null>,
      getViewportFn?: () => { x: number; y: number; zoom: number } | null
    ): Viewport => {
      const explicit = getViewportFn?.();
      if (explicit && Number.isFinite(explicit.x) && Number.isFinite(explicit.y) && Number.isFinite(explicit.zoom)) {
        return { x: explicit.x, y: explicit.y, zoom: Math.max(explicit.zoom, 0.001) };
      }
      return parseViewportFromDom(containerRef.current) ?? { x: 0, y: 0, zoom: 1 };
    },
    []
  );

  const getNodeElement = useCallback(
    (containerRef: RefObject<HTMLDivElement | null>, nodeId: string): HTMLElement | null => {
      const container = containerRef.current;
      if (!container) return null;
      const escaped = nodeId.replace(/"/g, '\\"');
      return container.querySelector(`[data-id="${escaped}"]`) as HTMLElement | null;
    },
    []
  );

  const getNodeDimensions = useCallback((node: SavedWorkflowNode | undefined): { width: number; height: number } => {
    if (!node) return NODE_FALLBACK_SIZE.default;
    const withSize = node as unknown as {
      width?: number;
      height?: number;
      measured?: { width?: number; height?: number };
    };
    const width =
      typeof withSize.width === "number"
        ? (withSize.width ?? 0)
        : typeof withSize.measured?.width === "number"
          ? (withSize.measured?.width ?? 0)
          : NODE_FALLBACK_SIZE[node.type]?.width ?? NODE_FALLBACK_SIZE.default.width;
    const height =
      typeof withSize.height === "number"
        ? (withSize.height ?? 0)
        : typeof withSize.measured?.height === "number"
          ? (withSize.measured?.height ?? 0)
          : NODE_FALLBACK_SIZE[node.type]?.height ?? NODE_FALLBACK_SIZE.default.height;
    return { width: Math.max(width, 120), height: Math.max(height, 100) };
  }, []);

  const getPortRatio = useCallback(
    (nodeType: string | undefined, handleId: string | null | undefined, kind: "source" | "target"): number => {
      if (!nodeType) return 0.5;
      const spec = getNodeSpec(nodeType);
      const ports = kind === "source" ? spec?.outputs ?? [] : spec?.inputs ?? [];
      if (!ports.length) return 0.5;
      if (!handleId) return 1 / (ports.length + 1);
      const idx = ports.findIndex((port) => port.key === handleId);
      if (idx < 0) return 0.5;
      return (idx + 1) / (ports.length + 1);
    },
    []
  );

  const getHandleFlowPoint = useCallback(
    (
      containerRef: RefObject<HTMLDivElement | null>,
      getViewportFn: (() => { x: number; y: number; zoom: number } | null) | undefined,
      workflowData: SavedWorkflowData,
      nodeId: string,
      handleId: string | null | undefined,
      kind: "source" | "target"
    ): Point | null => {
      const viewport = getViewport(containerRef, getViewportFn);
      const nodeElement = getNodeElement(containerRef, nodeId);
      if (nodeElement) {
        const selectorBase = kind === "source" ? ".react-flow__handle.source" : ".react-flow__handle.target";
        const escapedHandle = (handleId ?? "").replace(/"/g, '\\"');
        let handle = nodeElement.querySelector(
          `${selectorBase}[data-handleid="${escapedHandle}"]`
        ) as HTMLElement | null;
        if (!handle) {
          handle = nodeElement.querySelector(selectorBase) as HTMLElement | null;
        }
        if (handle) {
          const containerRect = containerRef.current?.getBoundingClientRect();
          const rect = handle.getBoundingClientRect();
          if (containerRect) {
            return screenToFlow(
              { x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top + rect.height / 2 },
              viewport
            );
          }
        }
      }

      const node = workflowData.nodes.find((item) => item.id === nodeId);
      if (!node) return null;
      const { width, height } = getNodeDimensions(node);
      const ratio = getPortRatio(node.type, handleId, kind);
      return {
        x: kind === "source" ? node.position.x + width : node.position.x,
        y: node.position.y + height * ratio,
      };
    },
    [getNodeDimensions, getNodeElement, getPortRatio, getViewport]
  );

  const getTalkAnchorFlow = useCallback(
    (
      containerRef: RefObject<HTMLDivElement | null>,
      getViewportFn: (() => { x: number; y: number; zoom: number } | null) | undefined,
      workflowData: SavedWorkflowData,
      nodeId: string
    ): Point | null => {
      const viewport = getViewport(containerRef, getViewportFn);
      const nodeElement = getNodeElement(containerRef, nodeId);
      if (nodeElement) {
        const containerRect = containerRef.current?.getBoundingClientRect();
        const rect = nodeElement.getBoundingClientRect();
        if (containerRect) {
          return screenToFlow({ x: rect.right - containerRect.left - 20, y: rect.top - containerRect.top + 18 }, viewport);
        }
      }

      const node = workflowData.nodes.find((item) => item.id === nodeId);
      if (!node) return null;
      const { width } = getNodeDimensions(node);
      return { x: node.position.x + width - 20, y: node.position.y + 18 };
    },
    [getNodeDimensions, getNodeElement, getViewport]
  );

  const getWorkflowBounds = useCallback(
    (workflowData: SavedWorkflowData) => {
      if (!workflowData.nodes.length) {
        return null;
      }
      const firstNode = workflowData.nodes[0];
      const firstSize = getNodeDimensions(firstNode);
      let minX = firstNode.position.x;
      let minY = firstNode.position.y;
      let maxX = firstNode.position.x + firstSize.width;
      let maxY = firstNode.position.y + firstSize.height;

      for (const node of workflowData.nodes.slice(1)) {
        const { width, height } = getNodeDimensions(node);
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + width);
        maxY = Math.max(maxY, node.position.y + height);
      }
      return { minX, minY, maxX, maxY };
    },
    [getNodeDimensions]
  );

  const getClosingAnchorFlow = useCallback(
    (workflowData: SavedWorkflowData): Point => {
      const endNode =
        workflowData.nodes.find((node) => node.type === "End") ??
        workflowData.nodes[workflowData.nodes.length - 1];
      if (!endNode) {
        return { x: robotFlowRef.current.x, y: robotFlowRef.current.y };
      }
      const { width, height } = getNodeDimensions(endNode);
      const offsets: Point[] = [
        { x: width + 92, y: -72 },
        { x: width + 78, y: height + 54 },
        { x: -96, y: -66 },
        { x: -94, y: height + 48 },
      ];
      const pick = offsets[Math.floor(Math.random() * offsets.length)] ?? offsets[0];
      const bounds = getWorkflowBounds(workflowData);
      const raw = {
        x: endNode.position.x + pick.x,
        y: endNode.position.y + pick.y,
      };
      if (!bounds) return raw;
      return {
        x: clamp(raw.x, bounds.minX - 140, bounds.maxX + 140),
        y: clamp(raw.y, bounds.minY - 140, bounds.maxY + 140),
      };
    },
    [getNodeDimensions, getWorkflowBounds]
  );

  const getLauncherFlowPoint = useCallback(
    (
      containerRef: RefObject<HTMLDivElement | null>,
      getViewportFn?: () => { x: number; y: number; zoom: number } | null
    ): Point => {
      const viewport = getViewport(containerRef, getViewportFn);
      const container = containerRef.current;
      if (!container) {
        return robotFlowRef.current;
      }
      const screenPoint = {
        x: container.clientWidth - 72,
        y: container.clientHeight - 132,
      };
      return screenToFlow(screenPoint, viewport);
    },
    [getViewport]
  );

  const syncOverlayFromFlow = useCallback(
    (
      containerRef: RefObject<HTMLDivElement | null>,
      getViewportFn?: () => { x: number; y: number; zoom: number } | null
    ) => {
      const viewport = getViewport(containerRef, getViewportFn);
      const robotScreen = flowToScreen(robotFlowRef.current, viewport);
      const robotScale = clamp(0.95 * viewport.zoom, 0.6, 2.6);
      setRobotState((prev) => {
        const next = { ...prev, x: robotScreen.x, y: robotScreen.y, scale: robotScale };
        if (Math.abs(prev.x - next.x) < 0.25 && Math.abs(prev.y - next.y) < 0.25 && Math.abs(prev.scale - next.scale) < 0.001) {
          return prev;
        }
        return next;
      });

      setSpeech((prev) => {
        if (!prev) return prev;
        const bubbleOffsetX = 20 * robotScale;
        const bubbleOffsetY = 68 * robotScale;
        const next = {
          ...prev,
          x: robotScreen.x + bubbleOffsetX,
          y: robotScreen.y - bubbleOffsetY,
        };
        if (Math.abs(prev.x - next.x) < 0.25 && Math.abs(prev.y - next.y) < 0.25) {
          return prev;
        }
        return next;
      });

      const trailModel = trailModelRef.current;
      if (trailModel.visible && trailModel.cubic) {
        const segment = cubicSubsegment(trailModel.cubic, clamp(trailModel.t, 0, 1));
        const screenCurve: CubicCurve = {
          p0: flowToScreen(segment.p0, viewport),
          p1: flowToScreen(segment.p1, viewport),
          p2: flowToScreen(segment.p2, viewport),
          p3: flowToScreen(segment.p3, viewport),
        };
        const path = cubicToPath(screenCurve);
        setTrail((prev) => {
          const next = { visible: true, path, color: trailModel.color };
          if (prev.visible && prev.path === next.path && prev.color === next.color) {
            return prev;
          }
          return next;
        });
      } else {
        setTrail((prev) => (prev.visible ? DEFAULT_TRAIL : prev));
      }
    },
    [getViewport, setRobotState]
  );

  const startRenderLoop = useCallback(
    (
      runId: number,
      containerRef: RefObject<HTMLDivElement | null>,
      getViewportFn?: () => { x: number; y: number; zoom: number } | null
    ) => {
      stopRenderLoop();
      const tick = () => {
        if (runIdRef.current !== runId) {
          renderLoopRef.current = null;
          return;
        }
        syncOverlayFromFlow(containerRef, getViewportFn);
        renderLoopRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [stopRenderLoop, syncOverlayFromFlow]
  );

  const animateFlowArcMove = useCallback(
    async (runId: number, from: Point, to: Point, durationMs: number, arcLiftPx: number) => {
      const startedAt = performance.now();
      const safeDuration = Math.max(1, durationMs / Math.max(speedRef.current, 0.1));
      return await new Promise<void>((resolve, reject) => {
        const frame = () => {
          try {
            throwIfCancelled(runId);
          } catch (error) {
            reject(error);
            return;
          }
          const now = performance.now();
          const linear = clamp((now - startedAt) / safeDuration, 0, 1);
          const progress = cubicOut(linear);
          const x = lerp(from.x, to.x, progress);
          const yLinear = lerp(from.y, to.y, progress);
          const y = yLinear - arcLiftPx * 4 * progress * (1 - progress);
          robotFlowRef.current = { x, y };
          if (linear >= 1) {
            resolve();
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },
    [throwIfCancelled]
  );

  const animateAlongConnectorCurve = useCallback(
    async (runId: number, curve: CubicCurve, durationMs: number, color: string) => {
      const startedAt = performance.now();
      const safeDuration = Math.max(1, durationMs / Math.max(speedRef.current, 0.1));
      trailModelRef.current = { visible: true, cubic: curve, t: 0, color };
      return await new Promise<void>((resolve, reject) => {
        const frame = () => {
          try {
            throwIfCancelled(runId);
          } catch (error) {
            reject(error);
            return;
          }
          const now = performance.now();
          const progress = clamp((now - startedAt) / safeDuration, 0, 1);
          robotFlowRef.current = cubicAt(curve, progress);
          trailModelRef.current = { visible: true, cubic: curve, t: progress, color };
          if (progress >= 1) {
            resolve();
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },
    [throwIfCancelled]
  );

  const waitForAudioReady = useCallback(
    async (runId: number, audio: HTMLAudioElement) => {
      if (audio.readyState >= 2) return;
      await new Promise<void>((resolve) => {
        let done = false;
        const timeout = window.setTimeout(() => {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        }, 2200);
        const onReady = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        };
        const cleanup = () => {
          window.clearTimeout(timeout);
          audio.removeEventListener("canplaythrough", onReady);
          audio.removeEventListener("loadeddata", onReady);
          audio.removeEventListener("error", onReady);
        };
        audio.addEventListener("canplaythrough", onReady, { once: true });
        audio.addEventListener("loadeddata", onReady, { once: true });
        audio.addEventListener("error", onReady, { once: true });
      });
      throwIfCancelled(runId);
    },
    [throwIfCancelled]
  );

  const waitForAudioEnd = useCallback(
    async (runId: number, audio: HTMLAudioElement) => {
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        };
        const cleanup = () => {
          audio.removeEventListener("ended", finish);
          audio.removeEventListener("error", finish);
        };
        audio.addEventListener("ended", finish, { once: true });
        audio.addEventListener("error", finish, { once: true });

        const watch = () => {
          if (done) return;
          try {
            throwIfCancelled(runId);
          } catch (error) {
            done = true;
            cleanup();
            reject(error);
            return;
          }
          requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      });
    },
    [throwIfCancelled]
  );

  const speakNarration = useCallback(
    async (
      runId: number,
      anchorFlow: Point,
      text: string,
      variant: RobotVariant,
      prefetchedAudio?: Promise<Blob | null>
    ) => {
      const message = text.trim();
      if (!message) return;

      setTranscript((prev) => [...prev, message]);
      setSpeech({ text: message, x: 0, y: 0 });
      robotFlowRef.current = anchorFlow;
      setRobotState((prev) => ({ ...prev, visible: true, pose: "smile", variant }));

      let spoke = false;
      let audioDrivenMouth = false;
      try {
        let audioBlob: Blob | null = null;
        if (prefetchedAudio) {
          audioBlob = await prefetchedAudio;
        }
        if (!audioBlob) {
          audioBlob = await synthesizeMicrAIVoice(message);
        }
        throwIfCancelled(runId);
        if (!audioBlob) {
          throw new Error("No TTS audio returned for narration.");
        }
        const objectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(objectUrl);
        audio.preload = "auto";
        narrationObjectUrlRef.current = objectUrl;
        narrationAudioRef.current = audio;
        await waitForAudioReady(runId, audio);
        throwIfCancelled(runId);
        await audio.play();
        spoke = true;
        setRobotState((prev) => ({ ...prev, pose: "talk1", variant }));

        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            await ctx.resume().catch(() => undefined);
            const source = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.72;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            narrationAudioCtxRef.current = ctx;
            const buffer = new Uint8Array(analyser.fftSize);
            let silenceMs = 0;
            let phaseMs = 0;
            let mouthToggle = false;
            let lastTs = performance.now();
            const tick = (ts: number) => {
              if (runIdRef.current !== runId || audio.paused || audio.ended) {
                narrationAudioRafRef.current = null;
                return;
              }
              const dt = Math.max(0, ts - lastTs);
              lastTs = ts;
              analyser.getByteTimeDomainData(buffer);
              let sum = 0;
              for (let i = 0; i < buffer.length; i += 1) {
                const v = (buffer[i] - 128) / 128;
                sum += v * v;
              }
              const rms = Math.sqrt(sum / Math.max(1, buffer.length));
              let pose: RobotPose = "talk1";

              if (rms > 0.085) {
                silenceMs = 0;
                pose = "talk2";
              } else if (rms > 0.018) {
                silenceMs = 0;
                phaseMs += dt;
                if (phaseMs >= 118) {
                  phaseMs = 0;
                  mouthToggle = !mouthToggle;
                }
                pose = mouthToggle ? "talk1" : "talk2";
              } else {
                silenceMs += dt;
                if (silenceMs >= 280) {
                  pose = "smile";
                } else {
                  phaseMs += dt;
                  if (phaseMs >= 138) {
                    phaseMs = 0;
                    mouthToggle = !mouthToggle;
                  }
                  pose = mouthToggle ? "talk1" : "talk2";
                }
              }

              setRobotState((prev) => ({ ...prev, pose }));
              narrationAudioRafRef.current = requestAnimationFrame((nextTs) => tick(nextTs));
            };
            narrationAudioRafRef.current = requestAnimationFrame((nextTs) => tick(nextTs));
            audioDrivenMouth = true;
          }
        } catch (err) {
          console.warn("[MicrAI Voice] Failed to bind mouth animation to audio analyser:", err);
        }

        if (!audioDrivenMouth) {
          clearSpeechInterval();
          speechIntervalRef.current = window.setInterval(() => {
            setRobotState((prev) => ({ ...prev, pose: prev.pose === "talk1" ? "talk2" : "talk1" }));
          }, 170);
        }
        await waitForAudioEnd(runId, audio);
      } catch (err) {
        if (isVoiceDebugEnabled()) {
          console.warn("[MicrAI Voice] Gradium TTS playback details:", err);
        }
        console.warn("[MicrAI Voice] Gradium TTS failed during playback:", err);
        spoke = false;
      } finally {
        clearSpeechInterval();
        clearNarrationAudio();
      }

      if (!spoke) {
        setRobotState((prev) => ({ ...prev, pose: "talk1", variant }));
        clearSpeechInterval();
        speechIntervalRef.current = window.setInterval(() => {
          setRobotState((prev) => ({ ...prev, pose: prev.pose === "talk1" ? "talk2" : "talk1" }));
        }, 190);
        const duration = clamp(message.length * 28, 1400, 3200);
        await sleep(duration, runId);
        clearSpeechInterval();
      }

      setRobotState((prev) => ({ ...prev, pose: "smile" }));
      setSpeech(null);
      await sleep(80, runId);
    },
    [
      clearNarrationAudio,
      clearSpeechInterval,
      setRobotState,
      sleep,
      throwIfCancelled,
      waitForAudioEnd,
      waitForAudioReady,
    ]
  );

  const startPlayback = useCallback(
    async ({
      mode,
      steps,
      closingNarration,
      currentWorkflow,
      finalWorkflow,
      canvasContainerRef,
      getViewport: getViewportFn,
      applyWorkflow,
      onComplete,
      onError,
    }: StartPlaybackArgs) => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      skipRequestedRef.current = false;
      clearSpeechInterval();
      clearNarrationAudio();
      setTranscript([]);
      setStatus("running");

      const working = cloneWorkflowData(currentWorkflow);
      const orderedSteps = [...steps].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const preloadedNarrationAudio = new Map<string, Promise<Blob | null>>();

      const primeNarrationAudio = (cacheKey: string, narrationText: string) => {
        const text = narrationText.trim();
        if (!text || preloadedNarrationAudio.has(cacheKey)) return;
        const request = synthesizeMicrAIVoice(text).catch((error) => {
          if (isVoiceDebugEnabled()) {
            console.warn("[MicrAI Voice] Prefetch TTS failed:", cacheKey, error);
          }
          return null;
        });
        preloadedNarrationAudio.set(cacheKey, request);
      };

      for (const step of orderedSteps) {
        if (step.kind !== "node_intro") continue;
        const stepId = String(step.step_id || "").trim();
        const narration = String(step.narration || "").trim();
        if (!stepId || !narration) continue;
        primeNarrationAudio(stepId, narration);
      }
      const closingLine = String(closingNarration || "").trim() || FALLBACK_CLOSING_LINE;
      primeNarrationAudio("__closing__", closingLine);

      const finalByNodeId = new Map(finalWorkflow.nodes.map((node) => [node.id, node]));
      const finalByEdgeKey = new Map(finalWorkflow.edges.map((edge) => [edgeKey(edge), edge]));
      const connectKeys = new Set(
        orderedSteps
          .filter((step) => step.kind === "connect")
          .map((step) =>
            edgeKey({
              source: step.source_node_id ?? "",
              sourceHandle: step.source_handle ?? undefined,
              target: step.target_node_id ?? "",
              targetHandle: step.target_handle ?? undefined,
            })
          )
      );

      if (mode === "create") {
        working.nodes = [];
        working.edges = [];
      } else {
        working.edges = working.edges.filter((edge) => !connectKeys.has(edgeKey(edge)));
      }

      applyWorkflow(cloneWorkflowData(working));
      await nextAnimationFrame(2);

      const firstNodeStep = orderedSteps.find((step) => step.kind === "node_intro" && step.node_id);
      if (firstNodeStep?.step_id) {
        const firstPrefetch = preloadedNarrationAudio.get(String(firstNodeStep.step_id).trim());
        if (firstPrefetch) {
          await withTimeout(firstPrefetch, 2200, null);
          throwIfCancelled(runId);
        }
      }
      const firstAnchorFlow = firstNodeStep?.node_id
        ? getTalkAnchorFlow(canvasContainerRef, getViewportFn, finalWorkflow, firstNodeStep.node_id)
        : null;
      robotFlowRef.current = firstAnchorFlow ?? { x: 70, y: 70 };
      setRobotState({
        visible: true,
        x: 70,
        y: 70,
        pose: "smile",
        variant: "purple",
        scale: 0.95,
      });
      startRenderLoop(runId, canvasContainerRef, getViewportFn);

      try {
        for (const step of orderedSteps) {
          throwIfCancelled(runId);

          if (step.kind === "node_intro") {
            const nodeId = step.node_id ?? "";
            if (!nodeId) continue;
            const finalNode = finalByNodeId.get(nodeId);
            if (!finalNode) continue;
            const stepId = String(step.step_id || "").trim();
            const narrationPromise = stepId ? preloadedNarrationAudio.get(stepId) : undefined;
            if (narrationPromise) {
              await withTimeout(narrationPromise, 1800, null);
              throwIfCancelled(runId);
            }

            const existingIndex = working.nodes.findIndex((node) => node.id === nodeId);
            if (existingIndex >= 0) {
              working.nodes[existingIndex] = cloneNode(finalNode);
            } else {
              working.nodes.push(cloneNode(finalNode));
            }
            applyWorkflow(cloneWorkflowData(working));
            await nextAnimationFrame(2);

            const talkAnchor = getTalkAnchorFlow(canvasContainerRef, getViewportFn, working, nodeId);
            if (talkAnchor) {
              const currentPos = { ...robotFlowRef.current };
              const moveDistance = distance(currentPos, talkAnchor);
              if (moveDistance > 6) {
                await animateFlowArcMove(
                  runId,
                  currentPos,
                  talkAnchor,
                  clamp(moveDistance / 0.65, 320, 1300),
                  clamp(moveDistance * 0.12, 16, 56)
                );
              }
              await speakNarration(
                runId,
                talkAnchor,
                step.narration?.trim() || "I am adding this node to keep your flow moving.",
                runtimeToVariant(step.runtime_type),
                narrationPromise
              );
            }
            continue;
          }

          if (step.kind === "connect") {
            const sourceNodeId = step.source_node_id ?? "";
            const targetNodeId = step.target_node_id ?? "";
            if (!sourceNodeId || !targetNodeId) continue;
            const resolvedRuntimeType = resolveRuntimeTypeForStep(step, finalByNodeId);

            const sourceAnchor = getHandleFlowPoint(
              canvasContainerRef,
              getViewportFn,
              working,
              sourceNodeId,
              step.source_handle,
              "source"
            );
            if (!sourceAnchor) continue;

            const key = edgeKey({
              source: sourceNodeId,
              sourceHandle: step.source_handle,
              target: targetNodeId,
              targetHandle: step.target_handle,
            });
            const finalEdge = finalByEdgeKey.get(key);
            const finalTargetNode = finalByNodeId.get(targetNodeId);
            let targetNodeExists = working.nodes.some((node) => node.id === targetNodeId);

            if (!targetNodeExists && finalTargetNode) {
              const hidden = cloneNode(finalTargetNode);
              hidden.style = { ...(hidden.style ?? {}), opacity: 0, pointerEvents: "none" };
              working.nodes.push(hidden);
              applyWorkflow(cloneWorkflowData(working));
              await nextAnimationFrame(2);
              targetNodeExists = true;
            }

            const targetAnchor = getHandleFlowPoint(
              canvasContainerRef,
              getViewportFn,
              targetNodeExists ? working : finalWorkflow,
              targetNodeId,
              step.target_handle,
              "target"
            );
            if (!targetAnchor) continue;

            const currentPos = { ...robotFlowRef.current };
            const toSourceDistance = distance(currentPos, sourceAnchor);
            setRobotState((prev) => ({
              ...prev,
              variant: runtimeToVariant(resolvedRuntimeType),
              pose: "smile",
            }));
            if (toSourceDistance > 4) {
              await animateFlowArcMove(
                runId,
                currentPos,
                sourceAnchor,
                clamp(toSourceDistance / 0.75, 240, 740),
                clamp(toSourceDistance * 0.14, 14, 46)
              );
            }

            const connectorCurve = buildConnectorCurve(sourceAnchor, targetAnchor);
            const sourceToTargetDistance = distance(sourceAnchor, targetAnchor);
            await animateAlongConnectorCurve(
              runId,
              connectorCurve,
              clamp(sourceToTargetDistance / 0.6, 450, 1800),
              runtimeToColor(resolvedRuntimeType)
            );

            if (targetNodeExists && finalTargetNode) {
              const idx = working.nodes.findIndex((node) => node.id === targetNodeId);
              if (idx >= 0) {
                working.nodes[idx] = cloneNode(finalTargetNode);
                applyWorkflow(cloneWorkflowData(working));
                await nextAnimationFrame(1);
              }
            }

            if (finalEdge) {
              const existing = working.edges.some((edge) => edgeKey(edge) === key);
              if (!existing) {
                working.edges.push({ ...finalEdge });
                applyWorkflow(cloneWorkflowData(working));
                await nextAnimationFrame(1);
              }
            }

            trailModelRef.current = {
              visible: false,
              cubic: null,
              t: 0,
              color: runtimeToColor(resolvedRuntimeType),
            };
            continue;
          }

          if (step.kind === "backtrack") {
            const targetNodeId = step.target_node_id ?? "";
            if (!targetNodeId) continue;
            const anchor = getTalkAnchorFlow(canvasContainerRef, getViewportFn, working, targetNodeId);
            if (!anchor) continue;
            await animateFlowArcMove(runId, { ...robotFlowRef.current }, anchor, 280, 20);
          }
        }

        throwIfCancelled(runId);
        const closeAnchor = getClosingAnchorFlow(finalWorkflow);
        const closeMoveDistance = distance(robotFlowRef.current, closeAnchor);
        if (closeMoveDistance > 6) {
          await animateFlowArcMove(
            runId,
            { ...robotFlowRef.current },
            closeAnchor,
            clamp(closeMoveDistance / 0.65, 380, 1300),
            clamp(closeMoveDistance * 0.14, 18, 64)
          );
        }
        await speakNarration(
          runId,
          closeAnchor,
          closingLine,
          "purple",
          preloadedNarrationAudio.get("__closing__")
        );

        const launcherFlowPoint = getLauncherFlowPoint(canvasContainerRef, getViewportFn);
        const returnDistance = distance(robotFlowRef.current, launcherFlowPoint);
        if (returnDistance > 4) {
          await animateFlowArcMove(
            runId,
            { ...robotFlowRef.current },
            launcherFlowPoint,
            clamp(returnDistance / 0.72, 320, 980),
            clamp(returnDistance * 0.12, 16, 58)
          );
        }

        applyWorkflow(cloneWorkflowData(finalWorkflow));
        await nextAnimationFrame(1);
        trailModelRef.current = { visible: false, cubic: null, t: 0, color: EDGE_COLORS.Text };
        setSpeech(null);
        clearSpeechInterval();
        clearNarrationAudio();
        setRobotState((prev) => ({ ...prev, pose: "smile", variant: "purple", visible: false }));
        stopRenderLoop();
        setStatus("done");
        onComplete();
      } catch (error) {
        if (error instanceof SkipPlaybackError) {
          setStatus("skipping");
          applyWorkflow(cloneWorkflowData(finalWorkflow));
          await nextAnimationFrame(1);
          clearSpeechInterval();
          clearNarrationAudio();
          trailModelRef.current = { visible: false, cubic: null, t: 0, color: EDGE_COLORS.Text };
          setSpeech(null);
          setRobotState((prev) => ({ ...prev, pose: "smile", variant: "purple", visible: false }));
          stopRenderLoop();
          setStatus("done");
          onComplete();
          return;
        }
        clearSpeechInterval();
        clearNarrationAudio();
        trailModelRef.current = { visible: false, cubic: null, t: 0, color: EDGE_COLORS.Text };
        setSpeech(null);
        stopRenderLoop();
        setStatus("error");
        setRobotState((prev) => ({ ...prev, pose: "smile", visible: false }));
        onError(error instanceof Error ? error : new Error("MicrAI playback failed"));
      } finally {
        skipRequestedRef.current = false;
      }
    },
    [
      animateAlongConnectorCurve,
      animateFlowArcMove,
      clearNarrationAudio,
      clearSpeechInterval,
      getHandleFlowPoint,
      getClosingAnchorFlow,
      getLauncherFlowPoint,
      getTalkAnchorFlow,
      setRobotState,
      speakNarration,
      startRenderLoop,
      stopRenderLoop,
      throwIfCancelled,
    ]
  );

  const skipPlayback = useCallback(() => {
    if (status !== "running") return;
    skipRequestedRef.current = true;
  }, [status]);

  const clearPlaybackUi = useCallback(() => {
    runIdRef.current += 1;
    skipRequestedRef.current = false;
    setStatus("idle");
    setTranscript([]);
    resetVisuals();
  }, [resetVisuals]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    const next = clamp(speed, 0.5, 2);
    speedRef.current = next;
    setSpeedMultiplier(next);
  }, []);

  return {
    status,
    isActive: status === "running" || status === "skipping",
    robot,
    speech,
    trail,
    transcript,
    speedMultiplier,
    setSpeedMultiplier: setPlaybackSpeed,
    startPlayback,
    skipPlayback,
    clearPlaybackUi,
  };
}
