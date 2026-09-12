"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Collapsible = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(({ className, open, onOpenChange, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(className)}
    data-state={open ? "open" : "closed"}
    {...props}
  />
));
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref,
      ...props,
    });
  }
  return (
    <button ref={ref} className={cn(className)} type="button" {...props}>
      {children}
    </button>
  );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("overflow-hidden", className)} {...props} />
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
