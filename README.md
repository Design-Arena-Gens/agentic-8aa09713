# Cricket DRS Hawk-Eye Analyzer

Web application that ingests cricket bowling footage, runs in-browser pose detection, and rebuilds a Hawk-Eye inspired 3D visualization of the delivery with telemetry on release speed, seam orientation, and predicted impact.

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Features

- Client-side TensorFlow MoveNet pose detection to approximate ball seam, release height, and frame phases.
- Frame-by-frame tagging plus interactive timeline for scrubbing through the delivery.
- Three.js Hawk-Eye renderer that projects the inferred trajectory on a full-length pitch.
- Responsive UI with telemetry cards for pace, seam angle, release height, impact prediction, and run-up velocity.
- 100% in-browser processing; no footage leaves the device.

## Deployment

This project is configured for Vercel. Deploy with:

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-8aa09713
```

The production deployment for this build is live at **https://agentic-8aa09713.vercel.app**.

## Key Files

- `app/page.tsx` – main page wiring upload, telemetry, timeline, and 3D viewport.
- `components/VideoAnalyzer.tsx` – video ingestion, MoveNet inference pipeline, and overlay renderer.
- `components/HawkEyeViewer.tsx` – 3D Hawk-Eye scene using react-three-fiber.
- `components/TelemetryPanel.tsx` – delivery telemetry and key-moment chips.
- `lib/detector.ts` – cached detector loader and TensorFlow backend selection.

## Notes

- Pose detection heuristics work best with clear side-on clips where the bowler occupies most of the frame.
- For reproducible local builds, ensure the working directory has at least 2 GB of free disk space before running `npm run build` (Next.js caches are sizable).
