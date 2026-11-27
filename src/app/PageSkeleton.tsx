import { Card, Skeleton } from '@/components/ui';

/** Shown while a module chunk loads. Mirrors the common header + grid layout. */
export const PageSkeleton = () => (
  <div className="space-y-5" aria-busy="true" aria-label="Loading module">
    <div className="space-y-2">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-2 h-3 w-32" />
        </Card>
      ))}
    </div>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Skeleton className="h-4 w-28" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    </div>
  </div>
);
