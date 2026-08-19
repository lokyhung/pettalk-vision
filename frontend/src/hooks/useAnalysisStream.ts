import { useEffect, useRef, useState } from "react";
import { lerpKeypoints, wsUrl } from "../lib/api";
import type { AnalysisResult, HomeZone, Keypoint, PetProfile } from "../types";

const CAPTURE_WIDTH = 720;
const TARGET_INTERVAL_MS = 120;

export function useAnalysisStream(
  video: HTMLVideoElement | null,
  active: boolean,
  profile: PetProfile,
  zones: HomeZone[] = [],
  resetToken = 0,
) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [displayKeypoints, setDisplayKeypoints] = useState<Keypoint[]>([]);
  const [connected, setConnected] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const targetRef = useRef<Keypoint[]>([]);
  const displayRef = useRef<Keypoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);
  const epochRef = useRef(0);

  useEffect(() => {
    if (!active) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    const epoch = ++epochRef.current;
    const socket = new WebSocket(wsUrl());
    wsRef.current = socket;
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      if (epoch !== epochRef.current) return;
      setConnected(true);
      setBackendError(null);
      socket.send(JSON.stringify({ type: "profile", profile: { ...profileRef.current, zones: zonesRef.current } }));
      socket.send(JSON.stringify({ type: "reset" }));
    };
    socket.onclose = () => {
      if (epoch !== epochRef.current) return;
      setConnected(false);
    };
    socket.onerror = () => {
      if (epoch !== epochRef.current) return;
      setBackendError("未能連接視覺後端，請先啟動 FastAPI 伺服器。");
    };
    socket.onmessage = (event) => {
      if (epoch !== epochRef.current) return;
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
      if (wsRef.current === socket) wsRef.current = null;
    };
  }, [active, resetToken]);

  useEffect(() => {
    setAnalysis(null);
    setDisplayKeypoints([]);
    displayRef.current = [];
    targetRef.current = [];
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "reset" }));
    }
  }, [resetToken]);

  useEffect(() => {
    if (!active || !connected) return;
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "profile", profile: { ...profile, zones } }));
    }
  }, [profile, zones, active, connected]);

  useEffect(() => {
    if (!active || !video) return;
    let timer = 0;
    let inFlight = false;
    const resetAt = performance.now();
    const canvas = captureRef.current ?? document.createElement("canvas");
    captureRef.current = canvas;

    const tick = async () => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || inFlight) {
        timer = window.setTimeout(tick, TARGET_INTERVAL_MS);
        return;
      }
      if (performance.now() - resetAt < 450) {
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
            blob
              .arrayBuffer()
              .then((buf) => {
                try {
                  socket.send(buf);
                } catch {
                  /* socket raced closed */
                }
              })
              .catch(() => undefined)
              .finally(() => {
                inFlight = false;
              });
          } else {
            inFlight = false;
          }
        },
        "image/jpeg",
        0.88,
      );
      timer = window.setTimeout(tick, TARGET_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timer);
  }, [active, video, connected, resetToken]);

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
