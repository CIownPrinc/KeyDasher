import type { Metadata } from "next";
import { Suspense } from "react";
import { RaceRoute } from "@/features/race/race-route";

export const metadata: Metadata = {
  title: "Race",
  robots: { index: false },
};

export default function RacePage() {
  return (
    <Suspense fallback={<main className="h-dvh bg-[#6b5cff]" />}>
      <RaceRoute />
    </Suspense>
  );
}
