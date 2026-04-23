"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailLink, isSignInWithEmailLink } from "firebase/auth";
import { auth } from "@/backend/lib/firebase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const completeEmailLinkSignIn = async () => {
      try {
        if (isSignInWithEmailLink(auth, window.location.href)) {
          // Get the email from sessionStorage (SECURITY: sessionStorage instead of localStorage to reduce XSS exposure)
          const email = window.sessionStorage.getItem("emailForSignIn");
          if (!email) {
            console.error(
              "No email found in sessionStorage for email link sign-in",
            );
            router.push("/auth");
            return;
          }

          // Complete the sign-in process
          const result = await signInWithEmailLink(
            auth,
            email,
            window.location.href,
          );

          // Clear the email from sessionStorage
          window.sessionStorage.removeItem("emailForSignIn");

          // Check for pending signup data
          const pendingSignUpData =
            window.sessionStorage.getItem("pendingSignUp");
          if (pendingSignUpData) {
            // The profile creation will be handled by the auth state listener
            // in AuthRepository which reads pendingSignUp
            window.sessionStorage.removeItem("pendingSignUp");
          }

          console.log("✅ Email link sign-in successful");
          router.push("/");
        } else {
          // Not an email link sign-in, redirect to home
          router.push("/");
        }
      } catch (error) {
        console.error("❌ Error completing email link sign-in:", error);
        router.push("/auth");
      }
    };

    completeEmailLinkSignIn();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4ade80] mx-auto mb-4"></div>
        <p className="text-white">Completing sign-in...</p>
      </div>
    </div>
  );
}
