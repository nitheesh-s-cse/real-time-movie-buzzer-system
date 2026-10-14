"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl">⚠️</p>
      <h1 className="text-2xl font-black text-white">Connection Error</h1>
      <p className="max-w-sm text-sm text-slate-400">
        Something went wrong loading this page. Check your connection and try again.
      </p>
      <button onClick={reset} className="btn-primary">
        Try Again
      </button>
    </main>
  );
}
