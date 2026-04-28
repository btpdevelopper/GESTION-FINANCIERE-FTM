import { RouteHeaderSkeleton, TableSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <RouteHeaderSkeleton />
      <TableSkeleton rows={6} cols={8} />
    </div>
  );
}
