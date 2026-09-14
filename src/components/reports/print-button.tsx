"use client";

import { Button } from "@/components/ui/button";
import { FileText } from "@/lib/icons";

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <FileText className="mr-2 h-4 w-4" />
      Print Preview
    </Button>
  );
}
