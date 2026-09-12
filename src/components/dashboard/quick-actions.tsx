"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Zap,
  Calendar,
  Shield,
  ClipboardCheck,
  Landmark,
  FileBarChart,
} from "@/lib/icons";

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/findings">
          <Plus />
          New Finding
        </Link>
      </Button>

      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/compliance">
          <Zap />
          Compliance
        </Link>
      </Button>

      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/audit-plans">
          <Calendar />
          Audit Plans
        </Link>
      </Button>

      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/ram">
          <Shield />
          Risk Assessment
        </Link>
      </Button>

      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/audit-execution">
          <ClipboardCheck />
          Audit Execution
        </Link>
      </Button>

      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/governance">
          <Landmark />
          Governance
        </Link>
      </Button>

      <Button variant="outline" className="h-10 cursor-pointer" asChild>
        <Link href="/reports">
          <FileBarChart />
          Reports
        </Link>
      </Button>
    </div>
  );
}
