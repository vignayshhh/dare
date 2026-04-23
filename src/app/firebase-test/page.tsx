import { notFound } from "next/navigation";
import { FirebaseTestClient } from "./FirebaseTestClient";

const isFirebaseTestEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ENABLE_FIREBASE_TEST_PAGE === "true";

export default function FirebaseTestPage() {
  if (!isFirebaseTestEnabled) {
    notFound();
  }

  return <FirebaseTestClient />;
}
