import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Calendar grid skeleton */}
      <div className="rounded-lg border">
        {/* Month header */}
        <div className="flex items-center justify-between border-b p-4">
          <Skeleton className="h-6 w-8" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-8" />
        </div>
        {/* Day labels */}
        <div className="grid grid-cols-7 border-b">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-2 text-center">
              <Skeleton className="mx-auto h-4 w-8" />
            </div>
          ))}
        </div>
        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-20 border-r border-b p-2">
              <Skeleton className="mb-1 h-4 w-6" />
              {i % 5 === 0 && <Skeleton className="h-5 w-full rounded" />}
              {i % 8 === 0 && <Skeleton className="mt-1 h-5 w-full rounded" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
