import { useCallback, useEffect, useRef, useState } from "react";

export type CameraFacing = "environment" | "user";

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function permissionMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "相機權限被拒絕。請在瀏覽器設定開啟相機，然後再試。";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "找不到可用相機。可改用示範影片。";
  }
  if (name === "NotReadableError") {
    return "相機正被其他程式使用。請關閉後再試。";
  }
  return err instanceof Error ? err.message : "無法啟動相機。";
}

async function openCamera(facing: CameraFacing): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { audio: false, video: { facingMode: facing } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("無法啟動相機。");
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(async (nextFacing: CameraFacing = "environment") => {
    setStarting(true);
    setError(null);
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    try {
      const media = await openCamera(nextFacing);
      const actual = media.getVideoTracks()[0]?.getSettings().facingMode;
      const resolved: CameraFacing = actual === "user" ? "user" : nextFacing;
      streamRef.current = media;
      setFacing(resolved);
      setStream(media);
      return media;
    } catch (err) {
      setError(permissionMessage(err));
      return null;
    } finally {
      setStarting(false);
    }
  }, []);

  const switchCamera = useCallback(async () => {
    const next: CameraFacing = facing === "environment" ? "user" : "environment";
    return start(next);
  }, [facing, start]);

  useEffect(() => () => stop(), [stop]);

  return { stream, error, starting, facing, start, stop, switchCamera };
}
