import { useEffect, useRef, useState } from "react";
import { lerpKeypoints, wsUrl } from "../lib/api";
import type { AnalysisResult, Keypoint, PetProfile } from "../types";

const CAPTURE_WIDTH = 640;
const TARGET_INTERVAL_MS = 120;

export function useAnalysisStream(
  video: HTMLVideoElement | null,
  active: boolean,
  profile: PetProfile,
) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [displayKeypoints, setDisplayKeypoints] = useState<Keypoint[]>([]);
  const [connected, setConnected] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const targetRef = useRef<Keypoint[]>([]);
  const displayRef = useRef<Keypoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    const socket = new WebSocket(wsUrl());
    wsRef.current = socket;
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      setConnected(true);
      setBackendError(null);
      socket.send(JSON.stringify({ type: "profile", profile: profileRef.current }));
    };
    socket.onclose = () => {
      setConnected(false);
    };
    socket.onerror = () => {
      setBackendError("未能連接視覺後端，請先啟動 FastAPI 伺服器。");
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AnalysisResult;
        setAnalysis(data);
        targetRef.current = data.keypoints ?? [];
      } catch {
        /* ignore malformed frames */
      }
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !connected) return;
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "profile", profile }));
    }
  }, [profile, active, connected]);

  useEffect(() => {
    if (!active || !video) return;
    let timer = 0;
    let inFlight = false;
    const canvas = captureRef.current ?? document.createElement("canvas");
    captureRef.current = canvas;

    const tick = async () => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || inFlight) {
        timer = window.setTimeout(tick, TARGET_INTERVAL_MS);
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) {
        timer = window.setTimeout(tick, TARGET_INTERVAL_MS);
        return;
      }
      const scale = CAPTURE_WIDTH / video.videoWidth;
      canvas.width = CAPTURE_WIDTH;
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        timer = window.setTimeout(tick, TARGET_INTERVAL_MS);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      inFlight = true;
      canvas.toBlob(
        (blob) => {
          if (blob && socket.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then((buf) => {
              try {
                socket.send(buf);
              } catch {
                /* socket raced closed */
              }
              inFlight = false;
            });
          } else {
            inFlight = false;
          }
        },
        "image/jpeg",
        0.62,
      );
      timer = window.setTimeout(tick, TARGET_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timer);
  }, [active, video, connected]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const target = targetRef.current;
      if (target.length) {
        const next = lerpKeypoints(displayRef.current, target, 0.22);
        displayRef.current = next;
        setDisplayKeypoints(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { analysis, displayKeypoints, connected, backendError };
}
