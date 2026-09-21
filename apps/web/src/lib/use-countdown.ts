import { useEffect, useState } from 'react';

/** Counts down once per second from `seconds` to 0. Pass null to stop. */
export function useCountdown(seconds: number | null) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = Date.now();
    setNow(t); // reset "now" too, or the first frame shows one second too many
    setEndsAt(seconds ? t + seconds * 1000 : null);
  }, [seconds]);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

export function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
