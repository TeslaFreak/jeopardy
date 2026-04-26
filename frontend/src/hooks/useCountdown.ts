import { useEffect, useState } from 'react';

/**
 * Counts down to a deadline (epoch ms). Returns seconds remaining and
 * whether the deadline has passed. Ticks every second.
 *
 * Pass `null` to reset / disable the countdown.
 */
export function useCountdown(deadline: number | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (deadline == null) {
      setSecondsLeft(null);
      setTotalSeconds(null);
      return;
    }

    const initial = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setTotalSeconds(initial);

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    tick();
    const id = setInterval(tick, 250); // 250 ms for smoother updates near 0
    return () => clearInterval(id);
  }, [deadline]);

  return {
    secondsLeft,
    totalSeconds,
    isExpired: secondsLeft !== null && secondsLeft <= 0,
  };
}
