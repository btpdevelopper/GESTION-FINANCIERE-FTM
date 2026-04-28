import { RouteHeaderSkeleton, FormSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <RouteHeaderSkeleton />
      <FormSkeleton fields={6} />
    </div>
  );
}
