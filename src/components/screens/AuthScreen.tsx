"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";

type AuthAction =
  | {
      type: "signin";
      email: string;
      password: string;
    }
  | {
      type: "signup";
      email: string;
      password: string;
      username: string;
      displayName: string;
    };

export function AuthScreen({
  onLogin,
  onContinueAsGuest,
}: {
  onLogin: (action: AuthAction) => Promise<void>;
  onContinueAsGuest?: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!email || !email.includes("@")) {
      errors.email = "Please enter a valid email address";
    }

    if (!password || (mode === "signup" ? password.length < 12 : false)) {
      errors.password =
        mode === "signup"
          ? "Password must be at least 12 characters"
          : "Password is required";
    }

    if (mode === "signup") {
      if (!username || username.trim().length < 3) {
        errors.username = "Username must be at least 3 characters";
      } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
        errors.username =
          "Username can only contain letters, numbers, and underscores";
      }

      if (!nickname || nickname.trim().length < 2) {
        errors.nickname = "Display name must be at least 2 characters";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAuthForm = async () => {
    console.log(
      "submitAuthForm called, mode:",
      mode,
      "isSubmitting:",
      isSubmitting,
    );
    if (isSubmitting) return;

    setError(null);
    setStatusMessage(
      mode === "signin" ? "Signing in..." : "Creating account...",
    );

    if (!validateForm()) {
      console.log("Form validation failed", fieldErrors);
      setStatusMessage(null);
      return;
    }

    console.log("Form validation passed, setting isSubmitting to true");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        console.log("Calling onLogin for signup");
        await onLogin({
          type: "signup",
          email: email.trim(),
          password,
          username: username.trim(),
          displayName: nickname.trim(),
        });
      } else {
        console.log("Calling onLogin for signin");
        await onLogin({
          type: "signin",
          email: email.trim(),
          password,
        });
      }
    } catch (submitError) {
      console.error("Submit error:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed.",
      );
      setStatusMessage(null);
      setIsSubmitting(false);
      return;
    }

    setStatusMessage("Success. Finishing sign-in...");
  };

  const handleButtonClick = () => {
    console.log("Button click handler called");
    setStatusMessage("Button clicked!");
    void submitAuthForm();
  };

  const handleModeToggle = () => {
    if (isSubmitting) return;
    setMode(mode === "signin" ? "signup" : "signin");
    setFieldErrors({});
    setError(null);
    setStatusMessage(null);
  };

  return (
    <div className="app-viewport safe-area-top safe-area-bottom relative bg-[#0a0f0a] flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm mx-auto pt-4 pb-8">
        <h1 className="auth-title mb-4">DARE</h1>
        <p className="text-[#94a3b8] text-sm mb-10 text-center">
          Accept and complete risky{"\n"}dares with your friends.
        </p>

        {error && (
          <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-500 text-sm text-center">{error}</p>
          </div>
        )}

        {statusMessage && !error && (
          <div className="w-full mb-4 p-3 bg-white/5 border border-white/10 rounded-lg">
            <p className="text-[#cbd5e1] text-sm text-center">
              {statusMessage}
            </p>
          </div>
        )}

        <div className="w-full space-y-4">
          {mode === "signup" && (
            <>
              <div className="auth-input-wrap">
                <User size={18} className="text-[#64748b] mr-3 shrink-0" />
                <input
                  type="text"
                  name="username"
                  placeholder="Choose username"
                  value={username}
                  onChange={(e) => {
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    );
                    if (fieldErrors.username) {
                      setFieldErrors((prev) => ({ ...prev, username: "" }));
                    }
                  }}
                  className={`auth-input ${fieldErrors.username ? "border-red-500/50" : ""}`}
                  autoComplete="username"
                  disabled={isSubmitting}
                  minLength={3}
                  maxLength={20}
                />
              </div>
              {fieldErrors.username && (
                <p className="text-red-500 text-xs mt-1">
                  {fieldErrors.username}
                </p>
              )}

              <div className="auth-input-wrap">
                <User size={18} className="text-[#64748b] mr-3 shrink-0" />
                <input
                  type="text"
                  name="nickname"
                  placeholder="Your nickname"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    if (fieldErrors.nickname) {
                      setFieldErrors((prev) => ({ ...prev, nickname: "" }));
                    }
                  }}
                  className={`auth-input ${fieldErrors.nickname ? "border-red-500/50" : ""}`}
                  autoComplete="nickname"
                  disabled={isSubmitting}
                  minLength={2}
                />
              </div>
              {fieldErrors.nickname && (
                <p className="text-red-500 text-xs mt-1">
                  {fieldErrors.nickname}
                </p>
              )}
            </>
          )}

          <div className="auth-input-wrap">
            <Mail size={18} className="text-[#64748b] mr-3 shrink-0" />
            <input
              type="email"
              name="email"
              placeholder="emma.davis@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: "" }));
                }
              }}
              className={`auth-input ${fieldErrors.email ? "border-red-500/50" : ""}`}
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>
          {fieldErrors.email && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>
          )}

          <div className="auth-input-wrap">
            <Lock size={18} className="text-[#64748b] mr-3 shrink-0" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: "" }));
                }
              }}
              className={`auth-input ${fieldErrors.password ? "border-red-500/50" : ""}`}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              disabled={isSubmitting}
              minLength={mode === "signin" ? 1 : 12}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[#64748b] hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            className="w-full bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#2a2a2a] disabled:text-[#64748b] text-black font-bold py-3.5 rounded-full text-base transition-colors mt-2 flex items-center justify-center gap-2 min-h-[52px] cursor-pointer"
            onClick={handleButtonClick}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                {mode === "signin" ? "Signing in..." : "Creating account..."}
              </>
            ) : (
              <>{mode === "signin" ? "Sign In" : "Sign Up"}</>
            )}
          </button>

          {onContinueAsGuest ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onContinueAsGuest}
              className="w-full border border-[#2a2a2a] bg-[#121812] text-white font-medium py-3.5 rounded-full text-base transition-colors hover:bg-[#172117] disabled:bg-[#121812] disabled:text-[#64748b] min-h-[52px]"
            >
              Continue in Guest Mode
            </button>
          ) : null}

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#2a2a2a]"></div>
            <span className="text-[#94a3b8] text-xs">OR</span>
            <div className="flex-1 h-px bg-[#2a2a2a]"></div>
          </div>

          <button
            type="button"
            disabled
            className="w-full bg-[#1a1a1a] disabled:bg-[#1a1a1a] disabled:text-[#64748b] border border-[#2a2a2a] text-white font-medium py-3.5 rounded-full text-base transition-colors flex items-center justify-center gap-2 min-h-[52px]"
          >
            Continue with Google
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 mt-6 text-sm">
          <button
            type="button"
            onClick={handleModeToggle}
            className="text-[#94a3b8] hover:text-white transition-colors px-4 py-2 min-h-[44px] min-w-[44px] bg-transparent border-none cursor-pointer"
            disabled={isSubmitting}
            style={{ touchAction: "manipulation" }}
          >
            {mode === "signin" ? "Sign Up" : "Sign In"}
          </button>
        </div>

        <div className="mt-8 text-center pb-4">
          <p className="text-[#64748b] text-xs mb-2">Secure authentication</p>
          <p className="text-[#94a3b8] text-xs max-w-xs mx-auto">
            Your password is handled by Firebase Authentication and never stored
            in this app&apos;s Firestore profile documents.
          </p>
        </div>
      </div>
    </div>
  );
}
