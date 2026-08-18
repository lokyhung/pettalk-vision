import { useCallback, useEffect, useState } from "react";

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stop = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(media);
      return media;
    } catch (err) {
      const message = err instanceof Error ? err.message : "鏡頭權限被拒絕。";
      setError(message);
      return null;
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { stream, error, starting, start, stop };
}
