"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import VideoAnalyzer, {
  AnalysisResult,
  AnalyzerStatus
} from "../components/VideoAnalyzer";
import TelemetryPanel from "../components/TelemetryPanel";

const HawkEyeViewer = dynamic(
  () => import("../components/HawkEyeViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="panel">
        <h3>Loading 3D Engine</h3>
        <p>Initializing the Hawk-Eye renderer. Hold tight...</p>
      </div>
    )
  }
);

export default function HomePage() {
  const [status, setStatus] = useState<AnalyzerStatus>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedKeyFrame, setSelectedKeyFrame] = useState<number>(0);

  const deliveryTimeline = useMemo(
    () =>
      result?.frames.map((frame, idx) => ({
        index: idx,
        label: frame.phase
      })) ?? [],
    [result]
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <span className="badge">Bowling Intelligence</span>
        <h1>Transform Bowler Footage into a Hawk-Eye Insight</h1>
        <span>
          Upload raw cricket bowling video and receive a simulated Decision
          Review System overlay with spatial trajectory, release metrics, seam
          position, and impact anticipation.
        </span>
        <div className="cta-bar">
          <div className="chip-row">
            <span className="chip">Pose Detection</span>
            <span className="chip">Seam Trajectory Estimation</span>
            <span className="chip">3D Pitch Reconstruction</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setSelectedKeyFrame(0);
              setStatus("idle");
            }}
          >
            Reset Analysis
          </button>
        </div>
      </section>

      <section className="grid two">
        <VideoAnalyzer
          status={status}
          onStatusChange={setStatus}
          onResult={(analysis) => {
            setResult(analysis);
            setSelectedKeyFrame(0);
          }}
          onSeek={(index) => setSelectedKeyFrame(index)}
          currentKeyFrame={selectedKeyFrame}
        />
        <TelemetryPanel status={status} result={result} />
      </section>

      <section className="panel">
        <h3>Delivery Timeline</h3>
        {deliveryTimeline.length === 0 ? (
          <p>
            Process the video to unlock ball release, pitch, and predicted impact
            markers. Each stage is linked to the simulated Hawk-Eye camera.
          </p>
        ) : (
          <>
            <div className="timeline">
              <input
                type="range"
                min={0}
                max={deliveryTimeline.length - 1}
                value={selectedKeyFrame}
                onChange={(evt) => setSelectedKeyFrame(Number(evt.target.value))}
              />
              <span className="chip">
                {deliveryTimeline[selectedKeyFrame]?.label ?? "Frame"}
              </span>
            </div>
            <p>
              Scrub through the delivery phases. Key frames have been tagged for
              load-up, release, pitch, and stumps.
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h3>Hawk-Eye Reconstruction</h3>
        <div className="three-container">
          <HawkEyeViewer
            delivery={result}
            keyFrameIndex={selectedKeyFrame}
          />
        </div>
      </section>
    </main>
  );
}
