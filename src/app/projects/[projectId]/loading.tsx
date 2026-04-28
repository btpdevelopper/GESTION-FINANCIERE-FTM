import { RouteHeaderSkeleton, CardGridSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-5">
      <RouteHeaderSkeleton subtitle />
      <CardGridSkeleton count={6} />
    </div>
  );
}
