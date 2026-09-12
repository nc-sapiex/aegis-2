import { Skeleton } from "@/components/ui/skeleton";

export default function ComplianceLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-md border">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
