import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOwnerAuth } from "@/context/OwnerAuthContext";

// Keep in step with signupSchema in yulo_backend/server/routes/owner/auth.routes.js.
const NAME_MIN = 2;
const NAME_MAX = 60;
const PHONE_RE = /^[6-9]\d{9}$/;

function normalizePhone(raw) {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function passwordError(pw) {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 64) return "Password must be at most 64 characters";
  const missing = [];
  if (!/[a-z]/.test(pw)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(pw)) missing.push("an uppercase letter");
  if (!/\d/.test(pw)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push("a special character");
  return missing.length ? `Password needs ${missing.join(", ")}` : "";
}

function validateSignup({ name, phone, password }) {
  const errors = {};
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN) errors.name = `Full name must be at least ${NAME_MIN} characters`;
  else if (trimmed.length > NAME_MAX) errors.name = `Full name must be at most ${NAME_MAX} characters`;
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Enter a valid 10-digit mobile number";
  const pwErr = passwordError(password);
  if (pwErr) errors.password = pwErr;
  return errors;
}

function FieldError({ message }) {
  return message ? <p className="mt-1.5 text-xs text-red-600">{message}</p> : null;
}

export default function OwnerLoginPage() {
  const navigate = useNavigate();
  const { login, signup } = useOwnerAuth();

  const [mode, setMode]     = useState("login");
  const [form, setForm]     = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    // Phone: digits only. A pasted "+91 98765-43210" is reduced to its 10-digit number.
    const next = name === "phone" ? normalizePhone(value) : value;
    setForm((prev) => ({ ...prev, [name]: next }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (mode === "signup") {
      const errors = validateSignup(form);
      setFieldErrors(errors);
      if (Object.keys(errors).length) return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login({ email: form.email, password: form.password });
      } else {
        await signup({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
        });
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen font-sans">

      {/* ── Left brand panel ── */}
      <div
        className="hidden lg:flex w-[44%] flex-col justify-between p-12"
        style={{ background: "linear-gradient(160deg, #23180E 0%, #1A120A 100%)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-lg"
            style={{ background: "linear-gradient(135deg, #A4161A, #D9480F)" }}
          />
          <span className="text-lg font-bold tracking-tight text-white">Yulo Stores</span>
        </div>

        {/* Hero text */}
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#F2A65A]">
            Owner Portal
          </p>
          <h2 className="text-[32px] font-bold leading-snug text-white">
            Run your restaurant<br />
            <span className="text-[#F2A65A]">with confidence.</span>
          </h2>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/40">
            Manage your menu, track live orders, and keep your kitchen team
            in sync — all from one place.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-2">
            {["Live Orders", "Menu Management", "Staff Control", "Analytics"].map((f) => (
              <span
                key={f}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/20">© 2025 Yulo Stores</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#FFF8F5] px-6 py-12">

        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div
            className="h-7 w-7 rounded-lg"
            style={{ background: "linear-gradient(135deg, #A4161A, #D9480F)" }}
          />
          <span className="text-lg font-bold text-[#23180E]">Yulo Stores</span>
        </div>

        <div className="w-full max-w-[360px]">

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-[#23180E]">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="mt-1.5 text-sm text-[#7a6555]">
              {mode === "login"
                ? "Sign in to your owner account"
                : "Get started with your restaurant"}
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-[#F5DFCE] bg-white p-7 shadow-sm">

            {/* Toggle */}
            <div className="mb-6 flex rounded-xl bg-[#FFF8F5] p-1">
              {["login", "signup"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(""); setFieldErrors({}); }}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === m
                      ? "bg-[#23180E] text-white shadow-sm"
                      : "text-[#a08070] hover:text-[#23180E]"
                  }`}
                >
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7a6555]">
                    Full Name
                  </label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    required
                    minLength={NAME_MIN}
                    maxLength={NAME_MAX}
                    className="w-full rounded-xl border border-[#F5DFCE] bg-[#FFFAF7] px-4 py-3 text-sm text-[#23180E] placeholder-[#c4aa96] outline-none transition focus:border-[#D9480F] focus:ring-1 focus:ring-[#D9480F]/30"
                  />
                  <FieldError message={fieldErrors.name} />
                </div>
              )}

              {mode === "signup" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7a6555]">
                    Phone (optional)
                  </label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="9876543210"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    className="w-full rounded-xl border border-[#F5DFCE] bg-[#FFFAF7] px-4 py-3 text-sm text-[#23180E] placeholder-[#c4aa96] outline-none transition focus:border-[#D9480F] focus:ring-1 focus:ring-[#D9480F]/30"
                  />
                  <FieldError message={fieldErrors.phone} />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7a6555]">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="owner@restaurant.com"
                  required
                  className="w-full rounded-xl border border-[#F5DFCE] bg-[#FFFAF7] px-4 py-3 text-sm text-[#23180E] placeholder-[#c4aa96] outline-none transition focus:border-[#D9480F] focus:ring-1 focus:ring-[#D9480F]/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7a6555]">
                  Password
                </label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={handleChange}
                    placeholder={mode === "signup" ? "Min 8 chars, Aa, 1, #" : "Your password"}
                    required
                    className="w-full rounded-xl border border-[#F5DFCE] bg-[#FFFAF7] px-4 py-3 pr-12 text-sm text-[#23180E] placeholder-[#c4aa96] outline-none transition focus:border-[#D9480F] focus:ring-1 focus:ring-[#D9480F]/30"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#c4aa96] hover:text-[#7a6555]"
                  >
                    {showPw ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                {mode === "signup" && !fieldErrors.password && (
                  <p className="mt-1.5 text-xs text-[#a08070]">
                    8+ characters with uppercase, lowercase, a number and a special character.
                  </p>
                )}
                <FieldError message={fieldErrors.password} />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #A4161A 0%, #D9480F 100%)" }}
              >
                {loading
                  ? mode === "login" ? "Signing in…" : "Creating account…"
                  : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-[#a08070]">
            Are you staff?{" "}
            <a href="/staff/login" className="font-semibold text-[#23180E] hover:underline">
              Staff portal →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
