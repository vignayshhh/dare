export function isFirestoreOfflineError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message =
    typeof maybeError.message === "string"
      ? maybeError.message.toLowerCase()
      : "";

  return (
    code === "unavailable" ||
    message.includes("client is offline") ||
    message.includes("failed to get document because the client is offline")
  );
}

export function logFirestoreError(message: string, error: unknown): void {
  if (isFirestoreOfflineError(error)) {
    console.warn(message);
    return;
  }

  console.error(message, error);
}
