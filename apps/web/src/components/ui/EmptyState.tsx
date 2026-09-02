import React, { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      {icon && (
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
        {title}
      </h3>
      {description && (
        <p className="mt-2 text-sm text-gray-400 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
