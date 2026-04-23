import { useState, useEffect, useCallback } from 'react';

interface CountdownTimerOptions {
  initialTime: number; // in seconds
  onTimeUp?: () => void;
  autoStart?: boolean;
}

export function useCountdownTimer({ 
  initialTime, 
  onTimeUp, 
  autoStart = true 
}: CountdownTimerOptions) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [startTime, setStartTime] = useState<number | null>(autoStart ? Date.now() : null);

  // Calculate time based on start time to handle background/inactive tabs
  useEffect(() => {
    if (!isRunning || !startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, initialTime - elapsed);
      
      setTimeRemaining(remaining);
      
      if (remaining === 0) {
        setIsRunning(false);
        onTimeUp?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, startTime, initialTime, onTimeUp]);

  const start = useCallback(() => {
    if (timeRemaining > 0) {
      setIsRunning(true);
      setStartTime(Date.now());
    }
  }, [timeRemaining]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback((newTime?: number) => {
    const resetTime = newTime ?? initialTime;
    setTimeRemaining(resetTime);
    setIsRunning(false);
    setStartTime(null);
  }, [initialTime]);

  const resume = useCallback(() => {
    if (timeRemaining > 0 && !isRunning) {
      // Calculate new start time based on remaining time
      const elapsedSeconds = initialTime - timeRemaining;
      const newStartTime = Date.now() - (elapsedSeconds * 1000);
      setStartTime(newStartTime);
      setIsRunning(true);
    }
  }, [timeRemaining, isRunning, initialTime]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return {
    timeRemaining,
    isRunning,
    formattedTime: formatTime(timeRemaining),
    start,
    pause,
    reset,
    resume,
    percentage: initialTime > 0 ? (timeRemaining / initialTime) * 100 : 0
  };
}
