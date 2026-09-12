import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Settings sections */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-lg border p-6">
            <Skeleton className="h-6 w-40" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
