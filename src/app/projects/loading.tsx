import { RouteHeaderSkeleton, CardGridSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <RouteHeaderSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
