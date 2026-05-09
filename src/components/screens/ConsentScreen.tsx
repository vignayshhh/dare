"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore-v2";

export function ConsentScreen() {
  const { user, updateProfile } = useAuthStore();
  const [is18Plus, setIs18Plus] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!is18Plus || !consentAccepted) {
      setError("You must be 18+ and accept the terms to continue.");
      return;
    }

    if (!user?.id) {
      setError("User not authenticated.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await updateProfile({
        is_18_plus: true,
        consent_accepted: true,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save your consent.");
      }
    } catch (err) {
      console.error("Error updating consent:", err);
      setError("Failed to save your consent. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1a1a1a] rounded-2xl p-6 border border-[#2a2a2a] shadow-xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Age & Content Consent</h1>
          <p className="text-[#a0a0a0] text-sm">
            Before accessing DARE, you must verify your age and accept our terms.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-[#0d0d0d] rounded-lg p-4 border border-[#2a2a2a]">
            <h2 className="text-white font-semibold mb-2">Age Verification</h2>
            <p className="text-[#a0a0a0] text-sm mb-3">
              DARE contains user-generated content including challenges, dares, and social interactions that may not be suitable for minors.
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={is18Plus}
                onChange={(e) => setIs18Plus(e.target.checked)}
                className="w-5 h-5 rounded border-[#4ade80] bg-[#1a1a1a] text-[#4ade80] focus:ring-[#4ade80]"
              />
              <span className="text-white text-sm">
                I confirm that I am 18 years of age or older
              </span>
            </label>
          </div>

          <div className="bg-[#0d0d0d] rounded-lg p-4 border border-[#2a2a2a]">
            <h2 className="text-white font-semibold mb-2">Terms of Service</h2>
            <p className="text-[#a0a0a0] text-sm mb-3">
              By using DARE, you agree to our community guidelines, privacy policy, and acceptable use policy. You understand that content is user-generated and may include mature themes.
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                className="w-5 h-5 rounded border-[#4ade80] bg-[#1a1a1a] text-[#4ade80] focus:ring-[#4ade80]"
              />
              <span className="text-white text-sm">
                I accept the Terms of Service and Community Guidelines
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={!is18Plus || !consentAccepted || loading}
          className="w-full bg-[#4ade80] text-black font-semibold py-3 px-4 rounded-lg hover:bg-[#3cd876] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Saving..." : "I Accept & Continue"}
        </button>

        <p className="text-center text-[#606060] text-xs mt-4">
          By continuing, you confirm that you have read and agree to our terms.
        </p>
      </div>
    </div>
  );
}
