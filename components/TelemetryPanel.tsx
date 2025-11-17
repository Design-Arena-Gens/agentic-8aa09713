"use client";

import type { AnalyzerStatus, AnalysisResult } from "./VideoAnalyzer";

interface TelemetryPanelProps {
  status: AnalyzerStatus;
  result: AnalysisResult | null;
}

const TelemetryPanel = ({ status, result }: TelemetryPanelProps) => {
  const summary = result?.summary;
  const keyMoments = result?.keyMoments;

  return (
    <div className="panel">
      <h3>Telemetry</h3>
      <p>
        Extracted ball release metrics, seam orientation, strike-zone prediction, and run-up
        intensity. Values update automatically after each analysis.
      </p>

      <div className="telemetry">
        <div className="telemetry-card">
          <strong>{summary ? `${Math.round(summary.releaseSpeedKph)} km/h` : "--"}</strong>
          <span>Release Pace</span>
        </div>
        <div className="telemetry-card">
          <strong>{summary ? `${summary.seamAngle.toFixed(1)}°` : "--"}</strong>
          <span>Seam Orientation</span>
        </div>
        <div className="telemetry-card">
          <strong>{summary ? `${summary.releaseHeight.toFixed(2)} m` : "--"}</strong>
          <span>Release Height</span>
        </div>
        <div className="telemetry-card">
          <strong>
            {summary ? `${summary.predictedImpactMeters.toFixed(2)} m` : "--"}
          </strong>
          <span>Impact From Stumps</span>
        </div>
        <div className="telemetry-card">
          <strong>{summary ? `${Math.round(summary.runupVelocityKph)} km/h` : "--"}</strong>
          <span>Run-Up Velocity</span>
        </div>
      </div>

      <div className="grid">
        <div className="chip-row">
          <span className="chip">
            Release Frame: {keyMoments ? keyMoments.releaseFrame + 1 : "--"}
          </span>
          <span className="chip">
            Pitch Frame: {keyMoments ? keyMoments.pitchFrame + 1 : "--"}
          </span>
          <span className="chip">
            Impact Frame: {keyMoments ? keyMoments.impactFrame + 1 : "--"}
          </span>
        </div>
        <span style={{ color: "#8f9bdb", fontSize: "0.85rem" }}>
          {status === "processing"
            ? "Tracking seam rotation, release vectors, and bounce estimation..."
            : status === "completed"
              ? "Analysis locked. Adjust the playback slider for frame-level overlays."
              : "Upload a clip to populate quantitative telemetry."}
        </span>
      </div>
    </div>
  );
};

export default TelemetryPanel;
