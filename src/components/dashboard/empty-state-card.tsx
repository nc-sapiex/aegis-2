"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateCardProps {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: ReactNode;
  /** Use "inline" for table/list contexts (dashed border, no Card wrapper) */
  variant?: "card" | "inline";
}

export function EmptyStateCard({
  title,
  message,
  actionLabel,
  actionHref,
  icon,
  variant = "card",
}: EmptyStateCardProps) {
  const content = (
    <>
      {icon && <div className="text-muted-foreground mb-3">{icon}</div>}
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-xs">{message}</p>
      {actionLabel && actionHref && (
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        {content}
      </CardContent>
    </Card>
  );
}
