// Customer sign-in. Phone/OTP is the primary path
// (POST /api/auth/customer/otp/send → …/verify); email + password is offered as
// an alternative (POST /api/auth/login, POST /api/auth/signup).

import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Mail, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import CustomerLayout from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

const PHONE_DIGITS = 10;

export default function CustomerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, setSession } = useCustomer();

  const [mode, setMode] = useState("phone"); // "phone" | "email"
  const [emailMode, setEmailMode] = useState("login"); // "login" | "signup"
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = location.state?.from ?? "/order/menu";

  if (auth.isAuthenticated) return <Navigate to={from} replace />;

  async function sendOtp(event) {
    event.preventDefault();
    if (phone.length !== PHONE_DIGITS) {
      setError(`Enter a ${PHONE_DIGITS}-digit phone number`);
      return;
    }
    if (!tosAccepted) {
      setError("Please accept the terms to continue");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Outside production the server echoes the code back as `devOtp`.
      const { devOtp } = await auth.sendOtp(phone);
      setSession((s) => ({ ...s, phone }));
      navigate("/order/otp", { state: { from, phone, devOtp } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (emailMode === "signup") await auth.signup({ name, email, password });
      else await auth.login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-brand-cream bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30";

  return (
    <CustomerLayout title="Sign in" showBack>
      <div className="space-y-5 px-5 py-6">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-brand-cream/30 p-1">
          {[
            { key: "phone", label: "Phone", icon: Smartphone },
            { key: "email", label: "Email", icon: Mail },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setMode(t.key); setError(""); }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition",
                  mode === t.key ? "bg-white text-brand-orange shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">{error}</p>
        ) : null}

        {mode === "phone" ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Phone number</label>
              <div className="flex items-center gap-2">
                <span className="rounded-xl border border-brand-cream bg-white px-3 py-3 text-sm text-muted-foreground">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, PHONE_DIGITS))}
                  placeholder="9876543210"
                  className={inputClass}
                  required
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#D9480F]"
              />
              I agree to the terms of service and privacy policy.
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {loading ? "Sending OTP…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail} className="space-y-4">
            {emailMode === "signup" ? (
              <div>
                <label className="mb-1.5 block text-sm font-semibold">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputClass}
                  required
                  minLength={2}
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : emailMode === "signup" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setEmailMode((m) => (m === "login" ? "signup" : "login")); setError(""); }}
              className="w-full text-center text-sm font-semibold text-brand-orange"
            >
              {emailMode === "login"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </form>
        )}
      </div>
    </CustomerLayout>
  );
}
