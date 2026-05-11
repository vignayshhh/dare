"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const TOTAL_DURATION = 7500;
const PHASE_ARRIVAL_END = 2000;
const PHASE_FOCUS_END = 5500;
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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "#000",
        overflow: "hidden",
        width: "100vw",
        height: "100vh",
        display: dismissed ? "none" : "block",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: dismissed ? "none" : "block",
          zIndex: 1,
        }}
      />

      {/* DARE wordmark */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform:
            phase === "arrival"
              ? "translate(-50%, -50%) scale(0.8)"
              : phase === "focus"
                ? "translate(-50%, -50%) scale(1)"
                : phase === "release"
                  ? "translate(-50%, -50%) scale(1.1)"
                  : "translate(-50%, -50%) scale(0.8)",
          transition: "transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2.5rem, 18vw, 9rem)",
            color: "#ffffff",
            fontWeight: "800",
            letterSpacing: "0.1em",
            margin: 0,
            padding: 0,
            textShadow:
              "0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3), 0 0 60px rgba(255, 255, 255, 0.2)",
            opacity:
              phase === "arrival"
                ? 0
                : phase === "focus"
                  ? 1
                  : phase === "release"
                    ? 0
                    : 0,
            transition:
              "opacity 2s cubic-bezier(0.4, 0, 0.2, 1), transform 2s cubic-bezier(0.4, 0, 0.2, 1)",
            textAlign: "center",
            position: "relative",
          }}
        >
          DAR
          <span style={{ position: "relative" }}>
            E{/* Green dot */}
            <span
              style={{
                position: "absolute",
                bottom: "18%",
                right: "-8%",
                width: "clamp(0.5rem, 3vw, 1.5rem)",
                height: "clamp(0.5rem, 3vw, 1.5rem)",
                background:
                  "linear-gradient(to bottom right, #4ade80, #22c55e)",
                borderRadius: "50%",
                border: "2px solid #000",
                boxShadow: "0 0 10px rgba(74, 222, 128, 0.5)",
              }}
            />
          </span>
        </h1>
      </div>
    </div>
  );
}

export function LaunchGate({ children }: { children: React.ReactNode }) {
  const [gateState, setGateState] = useState<"checking" | "intro" | "ready">(
    "checking",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasPlayedThisSession = sessionStorage.getItem(STORAGE_KEY) === "1";
    setGateState(hasPlayedThisSession ? "ready" : "intro");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (gateState !== "intro") {
      return;
    }

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.inset = "0";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.inset = "";
    };
  }, [gateState]);

  const handleComplete = useCallback(() => {
    setGateState("ready");
  }, []);

  if (gateState === "checking") {
    return <div className="app-fixed-viewport bg-black" />;
  }

  if (gateState === "intro") {
    return <LaunchScreen onComplete={handleComplete} />;
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
