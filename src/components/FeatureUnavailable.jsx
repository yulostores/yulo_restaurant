// Rendered where a designed feature has no endpoint in the documented API.
// Better an explicit, honest gap than fixtures pretending to be live data.
// Every use of this component is listed in API-GAPS.md.

import { PlugZap } from "lucide-react";

export default function FeatureUnavailable({ title, needs = [], note }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-brand-cream bg-white p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-orange/10 text-brand-orange">
        <PlugZap className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {note ?? "This screen has no backing endpoint in the current API, so there is nothing to display yet."}
      </p>
      {needs.length > 0 ? (
        <div className="mt-5 text-left">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Endpoints required
          </p>
          <ul className="space-y-1">
            {needs.map((n) => (
              <li
                key={n}
                className="rounded-lg bg-[#FCFAF7] px-3 py-1.5 font-mono text-xs text-[#5a403e]"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
