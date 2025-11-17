"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Keypoint,
  PoseDetector
} from "@tensorflow-models/pose-detection";
import { loadDetector } from "../lib/detector";

export type AnalyzerStatus = "idle" | "loading-model" | "processing" | "completed" | "error";

export type FramePhase =
  | "Run-Up"
  | "Load-Up"
  | "Release"
  | "Pitch"
  | "Impact"
  | "Follow-Through";

export interface FrameSnapshot {
  time: number;
  phase: FramePhase;
  ballPosition: [number, number, number];
  seamAngle: number;
  speedKph: number;
  releaseHeight: number;
  keypoints: Keypoint[];
}

export interface AnalysisResult {
  frames: FrameSnapshot[];
  trajectory: [number, number, number][];
  keyMoments: {
    releaseFrame: number;
    pitchFrame: number;
    impactFrame: number;
  };
  summary: {
    releaseSpeedKph: number;
    seamAngle: number;
    releaseHeight: number;
    predictedImpactMeters: number;
    runupVelocityKph: number;
  };
}

interface VideoAnalyzerProps {
  status: AnalyzerStatus;
  onStatusChange: (value: AnalyzerStatus) => void;
  onResult: (result: AnalysisResult) => void;
  onSeek: (frameIndex: number) => void;
  currentKeyFrame: number;
}

const SAMPLE_FRAMES = 90;
const PITCH_LENGTH_METERS = 20.12;
const SEAM_SMOOTHING = 0.25;

function mapKeypointsToBallPosition(
  width: number,
  height: number,
  keypoints: Keypoint[]
): [number, number, number] {
  const wrist =
    keypoints.find((kp) => kp.name === "right_wrist") ??
    keypoints.find((kp) => kp.name === "left_wrist") ??
    keypoints[0];

  if (!wrist) {
    return [0, 1.2, 0];
  }

  const normalizedX = ((wrist.x ?? width / 2) / width) - 0.5;
  const normalizedY = 1 - (wrist.y ?? height * 0.6) / height;

  const x = normalizedX * 3.6; // lateral variation (~3.6m width)
  const y = Math.max(0.4, normalizedY * 2.6); // height above ground
  // map along pitch by temporal progression later
  return [x, y, 0];
}

function computeSeamAngle(keypoints: Keypoint[]): number {
  const wrist =
    keypoints.find((kp) => kp.name === "right_wrist") ??
    keypoints.find((kp) => kp.name === "left_wrist");
  const elbow =
    keypoints.find((kp) => kp.name === "right_elbow") ??
    keypoints.find((kp) => kp.name === "left_elbow");

  if (
    !wrist ||
    !elbow ||
    wrist.x == null ||
    wrist.y == null ||
    elbow.x == null ||
    elbow.y == null
  ) {
    return 12;
  }

  const dx = (wrist.x ?? 0) - (elbow.x ?? 0);
  const dy = (wrist.y ?? 0) - (elbow.y ?? 0);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return Math.round(angle * 10) / 10;
}

function smoothSeries(series: number[], factor = 0.35): number[] {
  const output: number[] = [];
  series.forEach((value, idx) => {
    if (idx === 0) {
      output.push(value);
      return;
    }
    output.push(output[idx - 1] * (1 - factor) + value * factor);
  });
  return output;
}

async function samplePosesFromVideo(
  video: HTMLVideoElement,
  detector: PoseDetector
): Promise<FrameSnapshot[]> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas rendering context unavailable.");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;

  const duration = video.duration || 3;
  const frames: FrameSnapshot[] = [];
  const step = Math.max(duration / SAMPLE_FRAMES, 0.02);

  for (let time = 0; time <= duration; time += step) {
    await new Promise<void>((resolve) => {
      const handleSeeked = () => {
        video.removeEventListener("seeked", handleSeeked);
        resolve();
      };
      video.addEventListener("seeked", handleSeeked);
      video.currentTime = Math.min(time, duration - 0.05);
    });

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poses = await detector.estimatePoses(video, { flipHorizontal: false });
    const keypoints =
      poses[0]?.keypoints?.filter(({ score }) => (score ?? 0) > 0.2) ?? [];
    const ballPosition = mapKeypointsToBallPosition(
      canvas.width,
      canvas.height,
      poses[0]?.keypoints ?? []
    );
    frames.push({
      time,
      phase: "Run-Up",
      ballPosition,
      seamAngle: computeSeamAngle(keypoints),
      speedKph: 0,
      releaseHeight: Math.max(ballPosition[1], 1.2),
      keypoints
    });
  }

  return frames;
}

function enrichFrames(frames: FrameSnapshot[]): AnalysisResult {
  if (frames.length === 0) {
    const fallback: FrameSnapshot = {
      time: 0,
      phase: "Run-Up",
      ballPosition: [0, 1.5, 0],
      seamAngle: 15,
      speedKph: 115,
      releaseHeight: 1.86,
      keypoints: []
    };
    return {
      frames: [fallback],
      trajectory: [[0, 1.5, 0]],
      keyMoments: {
        releaseFrame: 0,
        pitchFrame: 0,
        impactFrame: 0
      },
      summary: {
        releaseSpeedKph: 115,
        seamAngle: 15,
        releaseHeight: 1.86,
        predictedImpactMeters: 5.4,
        runupVelocityKph: 24
      }
    };
  }

  const positions = frames.map((frame, idx) => {
    const progress = idx / Math.max(frames.length - 1, 1);
    const depth = progress * PITCH_LENGTH_METERS;
    return [frame.ballPosition[0], frame.ballPosition[1], depth] as [
      number,
      number,
      number
    ];
  });

  const speeds: number[] = frames.map((frame, idx) => {
    if (idx === 0) return 0;
    const prev = positions[idx - 1];
    const curr = positions[idx];
    const dt = frames[idx].time - frames[idx - 1].time || 0.016;
    const dx = curr[0] - prev[0];
    const dy = curr[1] - prev[1];
    const dz = curr[2] - prev[2];
    const metersPerSec = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
    return Math.round(metersPerSec * 3.6);
  });

  const smoothedSpeeds = smoothSeries(speeds);
  const seamAngles = smoothSeries(
    frames.map((frame) => frame.seamAngle),
    SEAM_SMOOTHING
  );

  const releaseFrame =
    smoothedSpeeds.reduce(
      (acc, speed, idx) => (speed > smoothedSpeeds[acc] ? idx : acc),
      Math.floor(smoothedSpeeds.length * 0.4)
    ) ?? 0;

  const pitchFrame = Math.min(frames.length - 1, releaseFrame + Math.floor(frames.length * 0.25));
  const impactFrame = Math.min(frames.length - 1, pitchFrame + Math.floor(frames.length * 0.2));

  const phases: FramePhase[] = frames.map((_, idx) => {
    if (idx < releaseFrame * 0.5) return "Run-Up";
    if (idx < releaseFrame) return "Load-Up";
    if (idx === releaseFrame) return "Release";
    if (idx <= pitchFrame) return "Pitch";
    if (idx <= impactFrame) return "Impact";
    return "Follow-Through";
  });

  const enrichedFrames: FrameSnapshot[] = frames.map((frame, idx) => ({
    ...frame,
    phase: phases[idx],
    ballPosition: positions[idx],
    seamAngle: seamAngles[idx],
    speedKph: smoothedSpeeds[idx],
    releaseHeight: frames[idx].ballPosition[1]
  }));

  const releaseSpeedKph = smoothedSpeeds[releaseFrame] || 122;
  const runupVelocityKph = smoothedSpeeds[Math.floor(releaseFrame * 0.5)] || 22;
  const predictedImpactMeters = Math.max(
    0,
    PITCH_LENGTH_METERS - positions[impactFrame][2]
  );

  return {
    frames: enrichedFrames,
    trajectory: positions,
    keyMoments: {
      releaseFrame,
      pitchFrame,
      impactFrame
    },
    summary: {
      releaseSpeedKph,
      seamAngle: seamAngles[releaseFrame] || 14,
      releaseHeight: enrichedFrames[releaseFrame]?.releaseHeight ?? 1.85,
      predictedImpactMeters,
      runupVelocityKph
    }
  };
}

const VideoAnalyzer = ({
  status,
  onStatusChange,
  onResult,
  onSeek,
  currentKeyFrame
}: VideoAnalyzerProps) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<FrameSnapshot[]>([]);

  const selectedFrame = useMemo(() => framesRef.current[currentKeyFrame], [currentKeyFrame]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const drawOverlay = useCallback((frame?: FrameSnapshot) => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    const video = videoRef.current;
    if (!canvas || !ctx || !video) return;
    canvas.width = video.videoWidth || video.clientWidth || 1280;
    canvas.height = video.videoHeight || video.clientHeight || 720;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!frame) return;

    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(110, 140, 255, 0.8)";
    ctx.fillStyle = "rgba(110, 140, 255, 0.8)";

    const kp = frame.keypoints ?? [];
    kp.forEach((point) => {
      if (point.x == null || point.y == null) return;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    if (frame.ballPosition) {
      const videoX = (frame.ballPosition[0] / 3.6 + 0.5) * canvas.width;
      const videoY = (1 - frame.ballPosition[1] / 2.6) * canvas.height;
      ctx.beginPath();
      ctx.arc(videoX, videoY, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 133, 103, 0.95)";
      ctx.fill();
      ctx.font = "16px Inter, sans-serif";
      ctx.fillText(
        `${Math.round(frame.speedKph)} km/h • ${frame.phase}`,
        videoX + 12,
        videoY - 12
      );
    }
  }, []);

  useEffect(() => {
    drawOverlay(selectedFrame);
  }, [selectedFrame, drawOverlay]);

  const handleFile = useCallback(
    async (file: File) => {
      onStatusChange("loading-model");
      setError(null);
      try {
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error("Video element missing."));
            return;
          }
          const handleLoadedMetadata = () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            resolve();
          };
          video.addEventListener("loadedmetadata", handleLoadedMetadata);
          video.src = url;
          video.load();
        });

        const detector = await loadDetector();
        onStatusChange("processing");
        const video = videoRef.current;
        if (!video) throw new Error("Video element not ready.");
        video.pause();
        video.currentTime = 0;
        const frames = await samplePosesFromVideo(video, detector);
        const analysis = enrichFrames(frames);
        framesRef.current = analysis.frames;
        drawOverlay(analysis.frames[0]);
        onStatusChange("completed");
        onResult(analysis);
        onSeek(0);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Analysis failed. Please try a different clip."
        );
        onStatusChange("error");
      }
    },
    [drawOverlay, onResult, onSeek, onStatusChange]
  );

  return (
    <div className="panel">
      <h3>Video Intake</h3>
      <p>
        Import a side-on or front-on bowling clip (MP4 or MOV). Models run in-browser using
        TensorFlow.js, and no footage leaves your device.
      </p>

      <div className="upload-zone">
        <label htmlFor="video-upload">Select Bowling Clip</label>
        <input
          id="video-upload"
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              handleFile(file);
            }
          }}
        />
        <span>
          Status:{" "}
          {status === "idle"
            ? "Awaiting upload"
            : status === "loading-model"
              ? "Loading detection model"
              : status === "processing"
                ? "Processing frames"
                : status === "completed"
                  ? "Analysis complete"
                  : "Error"}
        </span>
        {error && <span style={{ color: "#ff8a8a" }}>{error}</span>}
      </div>

      <div className="video-wrapper" style={{ position: "relative" }}>
        <video
          ref={videoRef}
          src={videoUrl ?? ""}
          controls
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onTimeUpdate={(evt) => {
            if (!framesRef.current.length) return;
            const currentTime = evt.currentTarget.currentTime;
            const nearestIdx = framesRef.current.reduce(
              (closest, frame, idx) =>
                Math.abs(frame.time - currentTime) <
                Math.abs(framesRef.current[closest].time - currentTime)
                  ? idx
                  : closest,
              0
            );
            drawOverlay(framesRef.current[nearestIdx]);
            onSeek(nearestIdx);
          }}
        />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            width: "100%",
            height: "100%"
          }}
        />
      </div>
    </div>
  );
};

export default VideoAnalyzer;
