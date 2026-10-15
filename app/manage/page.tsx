import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
  // Never leak the page URL to third parties.
  referrer: "no-referrer",
};

export default function ManagePage() {
  return <Dashboard />;
}
