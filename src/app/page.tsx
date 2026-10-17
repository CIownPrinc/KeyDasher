import { Suspense } from "react";
import { HomeRoute } from "@/features/home/home-route";
import { HomeScreen } from "@/features/home/home-screen";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeScreen inviteCode={null} />}>
      <HomeRoute />
    </Suspense>
  );
}
