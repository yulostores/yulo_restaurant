// "Download bills" on the Bills screen — every bill raised on one day or across a date range,
// as an Excel workbook (GET /api/owner/:rId/bills/export.xlsx). The workbook has a day-wise
// summary, one row per bill and one row per dish. Days are India time, as on the bill list.

import { useState } from "react";
import { Download } from "lucide-react";

import { ownerApi } from "@/api/owner.api";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

// "YYYY-MM-DD" for a moment, in India time.
const istDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const shift = (ymd, days) => istDay(new Date(new Date(`${ymd}T12:00:00+05:30`).getTime() + days * DAY_MS));
const spanDays = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS) + 1;

function presets(today) {
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: shift(today, -1), to: shift(today, -1) },
    { label: "Last 7 days", from: shift(today, -6), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];
}

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BillsExport({ restaurantId }) {
  const toast = useToast();
  const today = istDay(new Date());
  const [mode, setMode] = useState("single"); // "single" | "range"
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const end = mode === "single" ? from : to;
  let problem = "";
  if (!from || !end) problem = "Choose a date.";
  else if (from > today || end > today) problem = "Dates can't be in the future.";
  else if (end < from) problem = "The end date must be on or after the start date.";
  else if (spanDays(from, end) > MAX_DAYS) problem = `Choose a range of ${MAX_DAYS} days or fewer.`;

  const pick = (p) => {
    setError("");
    setFrom(p.from);
    setTo(p.to);
    setMode(p.from === p.to ? "single" : "range");
  };

  const download = async () => {
    if (problem) return;
    setBusy(true);
    setError("");
    try {
      const { blob, filename } = await ownerApi.downloadBillsExcel(restaurantId, { from, to: end });
      saveFile(blob, filename ?? `bills-${from}${end !== from ? `-to-${end}` : ""}.xlsx`);
      toast.success("Bills downloaded");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const active = presets(today).find((p) => p.from === from && p.to === end);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-bold">Download bills in Excel</h2>
          <p className="text-sm text-muted-foreground">
            Every bill raised on the day or days you choose — with a day-wise summary, each bill&rsquo;s
            charges, and the dishes on it.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {presets(today).map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => pick(p)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                active?.label === p.label
                  ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                  : "border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div role="radiogroup" aria-label="Dates" className="flex rounded-lg border border-brand-cream p-0.5">
            {[
              { value: "single", label: "Single day" },
              { value: "range", label: "Date range" },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => {
                  setMode(m.value);
                  if (m.value === "range" && to < from) setTo(from);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  mode === m.value ? "bg-brand-gradient text-white" : "text-[#5a403e] hover:bg-brand-cream/30",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="bills-from">{mode === "single" ? "Date" : "From"}</Label>
            <Input
              id="bills-from"
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </div>
          {mode === "range" ? (
            <div className="space-y-1">
              <Label htmlFor="bills-to">To</Label>
              <Input
                id="bills-to"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                className="w-44"
              />
            </div>
          ) : null}

          <Button type="button" onClick={download} disabled={busy || Boolean(problem)}>
            <Download className="mr-1.5 h-4 w-4" />
            {busy ? "Preparing…" : "Download Excel"}
          </Button>
        </div>

        {problem || error ? <p className="text-sm text-brand-maroon">{error || problem}</p> : null}
      </CardContent>
    </Card>
  );
}
