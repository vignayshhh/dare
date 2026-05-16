"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("SW registered: ", registration);
          void registration.update();
        })
        .catch((registrationError) => {
          console.log("SW registration failed: ", registrationError);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);

    return () => {
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
