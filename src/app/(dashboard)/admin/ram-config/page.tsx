import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission, type Role } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/**
 * Admin page for RAM parameter configuration (R4).
 * Displays the 19 RAM parameters with weights and scoring criteria.
 * Requires system admin or CAE access.
 */
export default async function RamConfigPage() {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (
    !hasPermission(userRoles, "admin:system") &&
    !hasPermission(userRoles, "dashboard:cae")
  ) {
    redirect("/dashboard");
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const ramParams = await db.ramParameterConfig.findMany({
    where: { tenantId },
    orderBy: { displayOrder: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          RAM Parameter Configuration
        </h1>
        <p className="text-muted-foreground">
          19 risk assessment parameters with weights and scoring criteria for
          branch risk profiling
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Parameters</CardTitle>
          <CardDescription>
            {ramParams.length} parameters configured. Total weight should equal
            100%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Max Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ramParams.map((param, idx) => (
                  <TableRow key={param.id}>
                    <TableCell className="text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {param.code}
                    </TableCell>
                    <TableCell className="font-medium">{param.name}</TableCell>
                    <TableCell className="text-right">
                      {Number(param.weight).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(param.maxScore)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={param.isActive ? "default" : "secondary"}>
                        {param.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
