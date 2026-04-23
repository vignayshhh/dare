"use client";

import { useState } from "react";
import type { FirebaseTestResult } from "@/backend/utils/firebase-test";

export function FirebaseTestClient() {
  const [results, setResults] = useState<FirebaseTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runTests = async () => {
    setIsRunning(true);
    setHasRun(true);

    try {
      const { firebaseTester } = await import("@/backend/utils/firebase-test");
      const testResults = await firebaseTester.runAllTests();
      setResults(testResults);
    } catch (error) {
      setResults([
        {
          service: "Test Execution",
          status: "error",
          message: "Failed to run tests",
          details: error,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">
          Firebase Connection Test
        </h1>

        <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
          <button
            onClick={runTests}
            disabled={isRunning}
            className={`rounded-lg px-6 py-3 font-medium transition-colors ${
              isRunning
                ? "cursor-not-allowed bg-gray-300 text-gray-500"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isRunning ? "Running Tests..." : "Run Firebase Tests"}
          </button>
        </div>

        {hasRun && (
          <div className="space-y-4">
            <h2 className="mb-4 text-2xl font-semibold text-gray-800">
              Test Results
            </h2>

            {results.map((result, index) => (
              <div
                key={index}
                className={`rounded-lg border p-4 ${
                  result.status === "success"
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    {result.service}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      result.status === "success"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {result.status.toUpperCase()}
                  </span>
                </div>
                <p className="mb-2 text-gray-700">{result.message}</p>
                {result.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                      View Details
                    </summary>
                    <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
