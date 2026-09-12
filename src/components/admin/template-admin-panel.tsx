"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Archive } from "lucide-react";
import {
  createReportTemplate,
  deactivateTemplate,
} from "@/actions/admin/manage-templates";

type Template = {
  id: string;
  name: string;
  category: string;
  versionNumber: number;
  isActive: boolean;
  createdAt: Date;
  createdById: string | null;
};

interface TemplateAdminPanelProps {
  templates: Template[];
}

export function TemplateAdminPanel({ templates }: TemplateAdminPanelProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("AUDIT_SECTION");
  const [templateJson, setTemplateJson] = useState("{}");

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }

    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(templateJson);
    } catch {
      toast.error("Invalid JSON in template data");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createReportTemplate({
        name: name.trim(),
        category: category as "AUDIT_SECTION" | "CHECKLIST" | "REPORT_HEADER",
        templateData: parsedData,
      });

      if (result.success) {
        toast.success(
          `Template "${name}" created (v${(result.data as any)?.versionNumber ?? "new"})`,
        );
        setDialogOpen(false);
        setName("");
        setTemplateJson("{}");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (templateId: string, templateName: string) => {
    if (!confirm(`Deactivate template "${templateName}"?`)) return;

    setDeactivating(templateId);
    try {
      const result = await deactivateTemplate(templateId);
      if (result.success) {
        toast.success("Template deactivated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to deactivate");
    } finally {
      setDeactivating(null);
    }
  };

  const activeTemplates = templates.filter((t) => t.isActive);
  const inactiveTemplates = templates.filter((t) => !t.isActive);

  return (
    <div className="space-y-6">
      {/* Create new template */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Templates</CardTitle>
            <CardDescription>
              {activeTemplates.length} active template
              {activeTemplates.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Report Template</DialogTitle>
                <DialogDescription>
                  Creates a new version. Previous versions are auto-deactivated.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Standard Audit Report Header"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category *</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUDIT_SECTION">
                        Audit Section
                      </SelectItem>
                      <SelectItem value="CHECKLIST">Checklist</SelectItem>
                      <SelectItem value="REPORT_HEADER">
                        Report Header
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Template Data (JSON)
                  </label>
                  <Textarea
                    value={templateJson}
                    onChange={(e) => setTemplateJson(e.target.value)}
                    placeholder='{"sections": [], "fields": []}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {activeTemplates.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
              No active templates. Create one to get started.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Version</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTemplates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {t.category.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        v{t.versionNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(t.createdAt).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeactivate(t.id, t.name)}
                          disabled={deactivating === t.id}
                        >
                          <Archive className="mr-1 h-3 w-3" />
                          {deactivating === t.id ? "..." : "Deactivate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inactive templates */}
      {inactiveTemplates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Inactive Templates</CardTitle>
            <CardDescription>
              {inactiveTemplates.length} deactivated template
              {inactiveTemplates.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveTemplates.map((t) => (
                    <TableRow key={t.id} className="opacity-60">
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.category.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-center">
                        v{t.versionNumber}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
