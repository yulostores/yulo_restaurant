// OTP verification — POST /api/auth/customer/otp/verify. The server issues the
// access token + refresh cookie and tells us whether this was a first sign-up.
// The code is 6 digits (API.md § Verify Customer OTP).

import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import CustomerLayout from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export default function OtpVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, setSession } = useCustomer();

  const phone = location.state?.phone ?? "";
  const from = location.state?.from ?? "/order/menu";
  // Present only outside production — lets QA skip the SMS round trip.
  const devOtp = location.state?.devOtp;

  const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputs = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // No phone in the navigation state means the user deep-linked here.
  if (!phone) return <Navigate to="/order/login" replace />;

  function setDigit(index, value) {
    const char = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = char;
      return next;
    });
    if (char && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((c, i) => { next[i] = c; });
    setDigits(next);
    inputs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  async function verify(event) {
    event.preventDefault();
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) {
      setError(`Enter all ${OTP_LENGTH} digits`);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await auth.verifyOtp({ phone, code, tosAccepted: true });
      setSession((s) => ({ ...s, verified: true, phone }));
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError("");
    try {
      await auth.sendOtp(phone);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <CustomerLayout title="Verify your number" showBack>
      <form onSubmit={verify} className="space-y-5 px-5 py-6">
        <p className="text-sm text-muted-foreground">
          We sent a {OTP_LENGTH}-digit code to{" "}
          <span className="font-semibold text-foreground">+91 {phone}</span>.
        </p>

        {devOtp ? (
          <p className="rounded-lg bg-[#FFF3E0] px-3 py-2 text-xs text-[#D9480F]">
            Development mode — your code is <strong>{devOtp}</strong>
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">{error}</p>
        ) : null}

        <div className="flex justify-between gap-2" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={digit}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              className="h-14 w-full rounded-xl border border-brand-cream bg-white text-center text-xl font-bold outline-none transition focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? "Verifying…" : "Verify & continue"}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="w-full text-center text-sm font-semibold text-brand-orange disabled:text-muted-foreground"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </form>
    </CustomerLayout>
  );
}
