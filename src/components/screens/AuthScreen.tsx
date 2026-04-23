"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";

export function AuthScreen({ onLogin }: { onLogin: () => void }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isStuck, setIsStuck] = useState(false);
  const { signIn, signUp, signInWithGoogle, loading, error, clearError } =
    useAuthStore();

  const syncFormStateFromDom = () => {
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    const nextEmail = String(formData.get("email") || "");
    const nextPassword = String(formData.get("password") || "");
    const nextUsernameRaw = String(formData.get("username") || "");
    const nextNickname = String(formData.get("nickname") || "");
    const nextUsername = nextUsernameRaw
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    setEmail(nextEmail);
    setPassword(nextPassword);
    setUsername(nextUsername);
    setNickname(nextNickname);
  };

  const emergencyReset = () => {
    setIsStuck(false);
    clearError();
    setFieldErrors({});

    if (useAuthStore.getState().loading) {
      window.location.reload();
    }
  };

  useEffect(() => {
    if (!loading) {
      setIsStuck(false);
      return;
    }

    const timer = setTimeout(() => setIsStuck(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const timer = window.setTimeout(syncFormStateFromDom, 250);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const validateForm = (values?: {
    email?: string;
    password?: string;
    username?: string;
    nickname?: string;
  }) => {
    const nextEmail = values?.email ?? email;
    const nextPassword = values?.password ?? password;
    const nextUsername = values?.username ?? username;
    const nextNickname = values?.nickname ?? nickname;
    const errors: Record<string, string> = {};

    if (!nextEmail || !nextEmail.includes("@")) {
      errors.email = "Please enter a valid email address";
    }

    if (!nextPassword || nextPassword.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (mode === "signup") {
      if (!nextUsername || nextUsername.trim().length < 3) {
        errors.username = "Username must be at least 3 characters";
      } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(nextUsername.trim())) {
        errors.username =
          "Username can only contain letters, numbers, and underscores";
      }

      if (!nextNickname || nextNickname.trim().length < 2) {
        errors.nickname = "Display name must be at least 2 characters";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    syncFormStateFromDom();

    const form = formRef.current;
    const formData = form ? new FormData(form) : null;
    const submittedEmail = String(formData?.get("email") || email);
    const submittedPassword = String(formData?.get("password") || password);
    const submittedUsername = String(formData?.get("username") || username)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const submittedNickname = String(formData?.get("nickname") || nickname);

    setEmail(submittedEmail);
    setPassword(submittedPassword);
    setUsername(submittedUsername);
    setNickname(submittedNickname);

    if (
      !validateForm({
        email: submittedEmail,
        password: submittedPassword,
        username: submittedUsername,
        nickname: submittedNickname,
      }) ||
      loading
    ) {
      return;
    }

    const timeoutId = setTimeout(() => setIsStuck(true), 10000);

    try {
      const result =
        mode === "signup"
          ? await signUp({
              email: submittedEmail,
              username: submittedUsername.trim(),
              displayName: submittedNickname.trim(),
              password: submittedPassword,
            })
          : await signIn(submittedEmail, submittedPassword);

      if (result.success) {
        onLogin();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleGoogleSignIn = async () => {
    await signInWithGoogle();
  };

  return (
    <div className="screen-container overflow-y-auto px-4 py-6 sm:justify-center">
      <div className="w-full max-w-sm mx-auto my-auto">
        <h1 className="auth-title mb-4">DARE</h1>
        <p className="text-[#94a3b8] text-sm mb-10 text-center">
          Accept and complete risky{"\n"}dares with your friends.
        </p>

        {error && (
          <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-500 text-sm text-center">{error}</p>
          </div>
        )}

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onInput={syncFormStateFromDom}
          className="w-full space-y-4"
        >
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
                  disabled={loading}
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
                  disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
              minLength={8}
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
            type="submit"
            disabled={loading}
            className="w-full bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#2a2a2a] disabled:text-[#64748b] text-black font-bold py-3.5 rounded-full text-base transition-colors mt-2 flex items-center justify-center gap-2 min-h-[52px]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                {mode === "signin" ? "Signing in..." : "Creating account..."}
              </>
            ) : (
              <>{mode === "signin" ? "Sign In" : "Sign Up"}</>
            )}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#2a2a2a]"></div>
            <span className="text-[#94a3b8] text-xs">OR</span>
            <div className="flex-1 h-px bg-[#2a2a2a]"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-[#1a1a1a] hover:bg-[#2a2a2a] disabled:bg-[#1a1a1a] disabled:text-[#64748b] border border-[#2a2a2a] text-white font-medium py-3.5 rounded-full text-base transition-colors flex items-center justify-center gap-2 min-h-[52px]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </form>

        <div className="flex items-center justify-center gap-4 mt-6 text-sm">
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-[#94a3b8] hover:text-white transition-colors px-4 py-2 min-h-[44px] min-w-[44px]"
            disabled={loading}
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

          {isStuck && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-500 text-xs mb-2">
                Authentication seems stuck
              </p>
              <button
                onClick={emergencyReset}
                className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1 rounded-full transition-colors"
              >
                Emergency Reset
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
