// Reusable skeleton primitives — used by route loading.tsx files

export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

export function PageHeaderSkeleton({ withButton = true }: { withButton?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2">
        <Sk className="h-7 w-48" />
        <Sk className="h-4 w-32" />
      </div>
      {withButton && <Sk className="h-9 w-36 rounded-lg" />}
    </div>
  );
}

export function FormSectionSkeleton({
  title = true,
  fields = 4,
}: {
  title?: boolean;
  fields?: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
      {title && <Sk className="h-5 w-40 mb-2" />}
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Sk className="h-3.5 w-28" />
          <Sk className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
