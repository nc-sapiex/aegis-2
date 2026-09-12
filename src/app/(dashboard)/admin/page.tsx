import { Card, CardContent } from "@/components/ui/card";
import { Users, Building2, MapPin, FileText, Settings } from "@/lib/icons";
import Link from "next/link";
import { requirePermission } from "@/lib/guards";

const adminSections = [
  {
    title: "Users",
    description: "Manage user accounts, roles, and permissions",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Branches",
    description: "Manage branch offices and locations",
    href: "/admin/branches",
    icon: Building2,
  },
  {
    title: "Zones",
    description: "Manage audit zones and regional groupings",
    href: "/admin/zones",
    icon: MapPin,
  },
  {
    title: "Templates",
    description: "Manage observation and report templates",
    href: "/admin/templates",
    icon: FileText,
  },
  {
    title: "RAM Config",
    description: "Configure risk assessment model parameters",
    href: "/admin/ram-config",
    icon: Settings,
  },
];

export default async function AdminPage() {
  await requirePermission("admin:manage_users");

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Administration
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Manage users, branches, zones, templates, and system configuration
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="hover:bg-accent/50 transition-colors">
              <CardContent className="flex items-start gap-4 p-5">
                <div className="bg-primary/10 rounded-lg p-2.5">
                  <section.icon className="text-primary h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{section.title}</h2>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {section.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
