import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl">🎞️</p>
      <h1 className="text-2xl font-black text-white">Page Not Found</h1>
      <Link href="/" className="btn-primary">
        Back to Home
      </Link>
    </main>
  );
}
