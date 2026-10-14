import AdminLoginForm from "./AdminLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Guess the Movie</p>
          <h1 className="mt-2 text-3xl font-black text-white">Admin Login</h1>
          <p className="mt-2 text-sm text-slate-400">Organizer access only. No public registration.</p>
        </div>
        <AdminLoginForm />
      </div>
    </main>
  );
}
