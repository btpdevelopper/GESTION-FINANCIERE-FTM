import { RouteHeaderSkeleton, FormSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <RouteHeaderSkeleton />
      <FormSkeleton fields={4} />
    </div>
  );
}
