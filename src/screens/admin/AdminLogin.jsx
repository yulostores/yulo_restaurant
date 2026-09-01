// Platform admin sign-in (/admin/login) — POST /api/admin/auth/login.
// There is no admin signup: accounts are seeded server-side.

import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { useAdminAuth } from "@/context/AdminAuthContext";

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAdminAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? "/admin"} replace />;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ email, password });
      navigate(location.state?.from ?? "/admin", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar-gradient px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-[#FFFAF7] p-7 shadow-xl"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-gradient text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-bold text-[#23180E]">Yulo Admin</h1>
            <p className="text-xs text-muted-foreground">Platform Console</p>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">
            {error}
          </p>
        ) : null}

        <label className="mb-1.5 block text-sm font-semibold text-[#23180E]">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          className="mb-4 w-full rounded-xl border border-[#F5DFCE] bg-white px-4 py-3 text-sm text-[#23180E] outline-none transition focus:border-[#D9480F] focus:ring-1 focus:ring-[#D9480F]/30"
        />

        <label className="mb-1.5 block text-sm font-semibold text-[#23180E]">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mb-6 w-full rounded-xl border border-[#F5DFCE] bg-white px-4 py-3 text-sm text-[#23180E] outline-none transition focus:border-[#D9480F] focus:ring-1 focus:ring-[#D9480F]/30"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-gradient py-3 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
