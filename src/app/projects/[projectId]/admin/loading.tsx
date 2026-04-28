import { RouteHeaderSkeleton, FormSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <RouteHeaderSkeleton />
      <FormSkeleton fields={8} />
    </div>
  );
}
