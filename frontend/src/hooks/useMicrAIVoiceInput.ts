"use client";

import { useCallback, useRef, useState } from "react";
import { transcribeMicrAIVoice } from "@/lib/fastapi/voice";

type AudioContextWithWebkit = AudioContext & { webkitAudioContext?: typeof AudioContext };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isVoiceDebugEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_MICRAI_VOICE_DEBUG || "")
      .toLowerCase()
      .trim() === "true"
  );
}

function mergeFloatChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function encodeWavMono16Bit(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
    offset += text.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = clamp(samples[i] ?? 0, -1, 1);
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function useMicrAIVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isRecordingRef = useRef(false);
  const isTranscribingRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContextWithWebkit | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sinkGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(48000);
  const levelSmoothingRef = useRef<number>(0);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveFinalChunksRef = useRef<string[]>([]);
  const liveInterimRef = useRef("");
  const liveLastLoggedRef = useRef("");

  const getLiveTranscriptSnapshot = useCallback((): string => {
    return [...liveFinalChunksRef.current, liveInterimRef.current]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const teardownAudioGraph = useCallback(async () => {
    try {
      processorRef.current?.disconnect();
    } catch {
      // no-op
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // no-op
    }
    try {
      sinkGainRef.current?.disconnect();
    } catch {
      // no-op
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // no-op
      }
    }

    processorRef.current = null;
    sourceRef.current = null;
    sinkGainRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
  }, []);

  const stopLiveRecognition = useCallback((abort = false) => {
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      if (abort) recognition.abort();
      else recognition.stop();
    } catch {
      // ignore stop errors
    }
  }, []);

  const startLiveRecognition = useCallback(() => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const RecognitionCtor =
      win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      console.info(
        "[MicrAI Voice][Live] SpeechRecognition not available in this browser. Live word-by-word logs disabled."
      );
      return;
    }
    liveFinalChunksRef.current = [];
    liveInterimRef.current = "";
    liveLastLoggedRef.current = "";

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: unknown) => {
      const e = event as {
        resultIndex?: number;
        results?: ArrayLike<{
          isFinal?: boolean;
          0?: { transcript?: string };
        }>;
      };
      const results = e.results;
      if (!results) return;
      let interim = "";
      for (let i = e.resultIndex ?? 0; i < results.length; i += 1) {
        const result = results[i];
        const transcript = String(result?.[0]?.transcript || "").trim();
        if (!transcript) continue;
        if (result?.isFinal) {
          liveFinalChunksRef.current.push(transcript);
        } else {
          interim += `${transcript} `;
        }
      }
      liveInterimRef.current = interim.trim();
      const combined = [...liveFinalChunksRef.current, liveInterimRef.current]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (combined && combined !== liveLastLoggedRef.current) {
        liveLastLoggedRef.current = combined;
        console.info("[MicrAI Voice][Live Transcript]", combined);
      }
    };

    recognition.onerror = (event: unknown) => {
      const e = event as { error?: string };
      console.warn(
        "[MicrAI Voice][Live] SpeechRecognition error:",
        e?.error || event
      );
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        // Some browsers auto-end interim sessions; restart while still holding.
        try {
          recognition.start();
          return;
        } catch {
          // fallthrough
        }
      }
      speechRecognitionRef.current = null;
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
      console.info("[MicrAI Voice][Live] Recognition started.");
    } catch (err) {
      console.warn("[MicrAI Voice][Live] Could not start recognition:", err);
      speechRecognitionRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (isRecordingRef.current || isTranscribingRef.current) return false;
    setError(null);
    chunksRef.current = [];
    setLevel(0);
    levelSmoothingRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("Web Audio API is not available in this browser.");
      }

      const context = new AudioCtx();
      await context.resume();
      sampleRateRef.current = context.sampleRate || 48000;

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(2048, 1, 1);
      const sinkGain = context.createGain();
      sinkGain.gain.value = 0;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        chunksRef.current.push(copy);

        let sum = 0;
        for (let i = 0; i < input.length; i += 1) {
          const v = input[i] ?? 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / Math.max(1, input.length));
        levelSmoothingRef.current = levelSmoothingRef.current * 0.82 + rms * 0.18;
        setLevel(clamp(levelSmoothingRef.current * 4.8, 0, 1));
      };

      source.connect(processor);
      processor.connect(sinkGain);
      sinkGain.connect(context.destination);

      streamRef.current = stream;
      audioContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      sinkGainRef.current = sinkGain;
      isRecordingRef.current = true;
      setIsRecording(true);
      startLiveRecognition();
      if (isVoiceDebugEnabled()) {
        console.info("[MicrAI Voice] recording started", {
          sampleRate: sampleRateRef.current,
        });
      }
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start microphone recording.";
      setError(message);
      stopLiveRecognition(true);
      await teardownAudioGraph();
      isRecordingRef.current = false;
      setIsRecording(false);
      return false;
    }
  }, [startLiveRecognition, stopLiveRecognition, teardownAudioGraph]);

  const stopRecordingAndTranscribe = useCallback(async (): Promise<string> => {
    if (!isRecordingRef.current) return "";

    isRecordingRef.current = false;
    setIsRecording(false);
    setLevel(0);
    levelSmoothingRef.current = 0;
    const liveTranscript = getLiveTranscriptSnapshot();
    stopLiveRecognition();

    try {
      // Allow one more audio process cycle before teardown for tail capture.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
      await teardownAudioGraph();

      if (liveTranscript) {
        chunksRef.current = [];
        if (isVoiceDebugEnabled()) {
          console.info("[MicrAI Voice] using live transcript", {
            textLength: liveTranscript.length,
            preview: liveTranscript.slice(0, 120),
          });
        }
        return liveTranscript;
      }

      isTranscribingRef.current = true;
      setIsTranscribing(true);
      const merged = mergeFloatChunks(chunksRef.current);
      chunksRef.current = [];
      if (isVoiceDebugEnabled()) {
        console.info("[MicrAI Voice] recording stopped", {
          samples: merged.length,
          sampleRate: sampleRateRef.current,
        });
      }
      if (!merged.length) {
        return "";
      }
      const wavBlob = encodeWavMono16Bit(merged, sampleRateRef.current || 48000);
      if (isVoiceDebugEnabled()) {
        console.info("[MicrAI Voice] wav encoded", {
          bytes: wavBlob.size,
          type: wavBlob.type,
        });
      }
      const result = await transcribeMicrAIVoice(wavBlob);
      if (isVoiceDebugEnabled()) {
        console.info("[MicrAI Voice] transcription result", {
          textLength: (result.text || "").length,
          segments: result.segments,
          inputFormat: result.input_format,
          preview: (result.text || "").slice(0, 120),
        });
      }
      return (result.text || "").trim();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to transcribe voice input.";
      setError(message);
      return "";
    } finally {
      isTranscribingRef.current = false;
      setIsTranscribing(false);
    }
  }, [getLiveTranscriptSnapshot, stopLiveRecognition, teardownAudioGraph]);

  const cancelRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setLevel(0);
    levelSmoothingRef.current = 0;
    chunksRef.current = [];
    stopLiveRecognition(true);
    await teardownAudioGraph();
  }, [stopLiveRecognition, teardownAudioGraph]);

  return {
    isRecording,
    isTranscribing,
    level,
    error,
    startRecording,
    stopRecordingAndTranscribe,
    cancelRecording,
  };
}
