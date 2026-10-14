import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl">🚫</p>
      <h1 className="text-2xl font-black text-white">Unauthorized</h1>
      <p className="max-w-sm text-sm text-slate-400">
        You don&apos;t have permission to view this page, or your session has expired.
        Please log in again.
      </p>
      <div className="flex gap-3">
        <Link href="/team/login" className="btn-primary">
          Team Login
        </Link>
        <Link href="/admin/login" className="btn-secondary">
          Admin Login
        </Link>
      </div>
    </main>
  );
}
