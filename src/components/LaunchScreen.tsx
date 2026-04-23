"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const TOTAL_DURATION = 4500;
const PHASE_ARRIVAL_END = 1200;
const PHASE_FOCUS_END = 3200;
const PARTICLE_COUNT = 100;
const STORAGE_KEY = "dare_intro_played";

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  opacity: number;
  targetOpacity: number;
  vx: number;
  vy: number;
  drift: number;
  phase: number;
}

export function LaunchScreen({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef<"arrival" | "focus" | "release">("arrival");
  const [phase, setPhase] = useState<"arrival" | "focus" | "release">(
    "arrival",
  );
  const [dismissed, setDismissed] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setTimeout(() => onCompleteRef.current(), 500);
  }, []);

  // Initialize particles + run animation loop (once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const cx = w / 2;
    const cy = h / 2;
    const particles: Particle[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 80 + Math.random() * Math.max(w, h) * 0.45;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      particles.push({
        x,
        y,
        baseX: x,
        baseY: y,
        size: 1 + Math.random() * 2.5,
        opacity: 0,
        targetOpacity: 0.3 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        drift: 0.35 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      });
    }

    particlesRef.current = particles;
    startTimeRef.current = performance.now();

    // Hard failsafe
    const failsafe = setTimeout(finish, TOTAL_DURATION + 500);

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const cw = canvas.width;
      const ch = canvas.height;
      const centerX = cw / 2;
      const centerY = ch / 2;

      // Phase transitions — update ref + state for CSS
      if (elapsed < PHASE_ARRIVAL_END) {
        if (phaseRef.current !== "arrival") {
          phaseRef.current = "arrival";
          setPhase("arrival");
        }
      } else if (elapsed < PHASE_FOCUS_END) {
        if (phaseRef.current !== "focus") {
          phaseRef.current = "focus";
          setPhase("focus");
        }
      } else {
        if (phaseRef.current !== "release") {
          phaseRef.current = "release";
          setPhase("release");
        }
      }

      // Clear
      ctx.clearRect(0, 0, cw, ch);

      const pts = particlesRef.current;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];

        // Phase: Arrival — fade in particles
        if (elapsed < PHASE_ARRIVAL_END) {
          const arrivalProgress = elapsed / PHASE_ARRIVAL_END;
          p.opacity = p.targetOpacity * arrivalProgress * arrivalProgress;
          p.x += p.vx + Math.sin(now * 0.001 + p.phase) * p.drift * 0.5;
          p.y += p.vy + Math.cos(now * 0.0008 + p.phase) * p.drift * 0.35;
        }
        // Phase: Focus — gentle ambient drift (no convergence)
        else if (elapsed < PHASE_FOCUS_END) {
          p.x += p.vx + Math.sin(now * 0.001 + p.phase) * p.drift * 0.5;
          p.y += p.vy + Math.cos(now * 0.0008 + p.phase) * p.drift * 0.35;
          p.opacity = p.targetOpacity;
        }
        // Phase: Release — fade out
        else {
          const releaseProgress =
            (elapsed - PHASE_FOCUS_END) / (TOTAL_DURATION - PHASE_FOCUS_END);
          p.opacity = p.targetOpacity * (1 - releaseProgress * releaseProgress);
          p.x +=
            Math.sin(now * 0.001 + p.phase) *
            p.drift *
            (1 - releaseProgress) *
            0.35;
          p.y +=
            Math.cos(now * 0.0008 + p.phase) *
            p.drift *
            (1 - releaseProgress) *
            0.35;
        }

        // Draw particle
        if (p.opacity > 0.01) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(74, 222, 128, ${p.opacity})`;
          ctx.shadowColor = "rgba(74, 222, 128, 0.6)";
          ctx.shadowBlur = p.size * 3;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      if (elapsed >= TOTAL_DURATION) {
        finish();
        return;
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout(failsafe);
    };
  }, [finish]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className={`launch-screen ${dismissed ? "launch-screen--dismissed" : ""}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="launch-canvas" />

      {/* DARE wordmark */}
      <div
        className={`launch-wordmark ${
          phase === "focus" || phase === "release"
            ? "launch-wordmark--visible"
            : ""
        } ${phase === "release" ? "launch-wordmark--fade" : ""}`}
      >
        <h1 className="launch-title">DARE</h1>
      </div>
    </div>
  );
}

export function LaunchGate({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const played = sessionStorage.getItem(STORAGE_KEY);
      setShowIntro(played !== "1");
    } catch {
      setShowIntro(false);
    }
  }, []);

  // Not yet determined — render nothing briefly to prevent flash
  if (showIntro === null) {
    return (
      <div
        style={{
          background: "#0B0F0C",
          position: "fixed",
          inset: 0,
          zIndex: 9999,
        }}
      />
    );
  }

  if (showIntro) {
    return (
      <LaunchScreenWrapper onComplete={() => setShowIntro(false)}>
        {children}
      </LaunchScreenWrapper>
    );
  }

  return <>{children}</>;
}

function LaunchScreenWrapper({
  children,
  onComplete,
}: {
  children: React.ReactNode;
  onComplete: () => void;
}) {
  const [introDone, setIntroDone] = useState(false);

  const handleComplete = useCallback(() => {
    setIntroDone(true);
    onComplete();
  }, [onComplete]);

  return (
    <>
      {!introDone && <LaunchScreen onComplete={handleComplete} />}
      <div style={{ visibility: introDone ? "visible" : "hidden" }}>
        {children}
      </div>
    </>
  );
}
