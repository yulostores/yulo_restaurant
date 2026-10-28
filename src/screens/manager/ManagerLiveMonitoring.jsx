// Manager · Live Monitoring (/manager/live) — the same live dashboard as /live-monitor.
// Runs on the owner session: the backend has no manager role. See API-GAPS.md.

import LiveMonitorPage from "@/components/live/LiveMonitorPage";

export default function ManagerLiveMonitoring() {
  return <LiveMonitorPage title="Live Monitoring" />;
}
