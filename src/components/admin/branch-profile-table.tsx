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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "@/lib/icons";
import { Label } from "@/components/ui/label";
import { updateBranchProfile } from "@/actions/admin/manage-branch";

type Branch = {
  id: string;
  code: string;
  name: string;
  city: string;
  category: string | null;
  businessSize: number | null;
  staffStrength: number | null;
  ramScore: number | null;
  auditFrequency: number | null;
  lastAuditDate: Date | null;
  lastAuditRating: string | null;
  zoneId: string | null;
  zone: { id: string; name: string } | null;
};

type Zone = { id: string; name: string };

interface BranchProfileTableProps {
  branches: Branch[];
  zones: Zone[];
}

export function BranchProfileTable({
  branches,
  zones,
}: BranchProfileTableProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editZoneId, setEditZoneId] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editBusinessSize, setEditBusinessSize] = useState<string>("");
  const [editStaffStrength, setEditStaffStrength] = useState<string>("");

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setEditZoneId(branch.zoneId ?? "");
    setEditCategory(branch.category ?? "");
    setEditBusinessSize(branch.businessSize?.toString() ?? "");
    setEditStaffStrength(branch.staffStrength?.toString() ?? "");
  };

  const handleSave = async () => {
    if (!editing) return;
    setIsSaving(true);

    const result = await updateBranchProfile({
      branchId: editing.id,
      zoneId: editZoneId || null,
      category:
        (editCategory as "LARGE" | "MEDIUM" | "SMALL" | "VERY_SMALL") || null,
      businessSize: editBusinessSize ? parseFloat(editBusinessSize) : null,
      staffStrength: editStaffStrength ? parseInt(editStaffStrength, 10) : null,
    });

    setIsSaving(false);

    if (result.success) {
      toast.success(`Branch ${editing.code} updated`);
      setEditing(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const getCategoryBadge = (category: string | null) => {
    if (!category) return <span className="text-muted-foreground">—</span>;
    const colors: Record<string, string> = {
      LARGE: "bg-blue-100 text-blue-800",
      MEDIUM: "bg-green-100 text-green-800",
      SMALL: "bg-amber-100 text-amber-800",
      VERY_SMALL: "bg-gray-100 text-gray-800",
    };
    return (
      <Badge variant="outline" className={colors[category] ?? ""}>
        {category.replace(/_/g, " ")}
      </Badge>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>All Branches</CardTitle>
          <CardDescription>
            {branches.length} branches configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Business (₹L)</TableHead>
                  <TableHead className="text-right">Staff</TableHead>
                  <TableHead className="text-right">RAM</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono">{b.code}</TableCell>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{b.zone?.name ?? "—"}</TableCell>
                    <TableCell>{getCategoryBadge(b.category)}</TableCell>
                    <TableCell className="text-right">
                      {b.businessSize?.toLocaleString("en-IN") ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.staffStrength ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.ramScore?.toFixed(2) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Edit branch profile"
                        onClick={() => openEdit(b)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Branch Profile: {editing?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-zone">Zone</Label>
              <Select value={editZoneId} onValueChange={setEditZoneId}>
                <SelectTrigger id="edit-zone">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger id="edit-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not Set</SelectItem>
                  <SelectItem value="LARGE">Large</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="SMALL">Small</SelectItem>
                  <SelectItem value="VERY_SMALL">Very Small</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-business-size">
                Business Size (₹ Lakhs)
              </Label>
              <Input
                id="edit-business-size"
                type="number"
                value={editBusinessSize}
                onChange={(e) => setEditBusinessSize(e.target.value)}
                placeholder="e.g., 50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-staff-strength">Staff Strength</Label>
              <Input
                id="edit-staff-strength"
                type="number"
                value={editStaffStrength}
                onChange={(e) => setEditStaffStrength(e.target.value)}
                placeholder="e.g., 25"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
