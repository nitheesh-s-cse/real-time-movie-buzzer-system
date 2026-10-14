import TeamLoginForm from "./TeamLoginForm";

export const dynamic = "force-dynamic";

export default function TeamLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Guess the Movie</p>
          <h1 className="mt-2 text-3xl font-black text-white">Team Login</h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter your registered team name and the PIN given to you by the organizer.
          </p>
        </div>
        <TeamLoginForm />
      </div>
    </main>
  );
}
