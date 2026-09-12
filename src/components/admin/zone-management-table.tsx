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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, MapPin } from "@/lib/icons";
import { manageZone, deleteZone } from "@/actions/admin/manage-zone";

type Zone = {
  id: string;
  code: string;
  name: string;
  createdAt: Date;
  _count: { branches: number };
};

interface ZoneManagementTableProps {
  zones: Zone[];
}

export function ZoneManagementTable({ zones }: ZoneManagementTableProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [deletingZone, setDeletingZone] = useState<Zone | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const openAddDialog = () => {
    setEditingZone(null);
    setCode("");
    setName("");
    setDialogOpen(true);
  };

  const openEditDialog = (zone: Zone) => {
    setEditingZone(zone);
    setCode(zone.code);
    setName(zone.name);
    setDialogOpen(true);
  };

  const openDeleteDialog = (zone: Zone) => {
    setDeletingZone(zone);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Code and Name are required.");
      return;
    }

    setIsSaving(true);

    const result = await manageZone({
      zoneId: editingZone?.id,
      code: code.trim(),
      name: name.trim(),
    });

    setIsSaving(false);

    if (result.success) {
      toast.success(
        editingZone
          ? "Zone updated successfully."
          : "Zone created successfully.",
      );
      setDialogOpen(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to save zone.");
    }
  };

  const handleDelete = async () => {
    if (!deletingZone) return;

    setIsDeleting(true);

    const result = await deleteZone(deletingZone.id);

    setIsDeleting(false);

    if (result.success) {
      toast.success("Zone deleted successfully.");
      setDeleteDialogOpen(false);
      setDeletingZone(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to delete zone.");
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Zone Management
            </CardTitle>
            <CardDescription>
              Create and manage zones for grouping branches under ZAC workflow.
            </CardDescription>
          </div>
          <Button onClick={openAddDialog} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Zone
          </Button>
        </CardHeader>
        <CardContent>
          {zones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="text-muted-foreground mb-4 h-12 w-12" />
              <h3 className="text-lg font-semibold">No zones configured</h3>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Zones group branches for Zonal Audit Committee (ZAC) review. Add
                your first zone to get started.
              </p>
              <Button onClick={openAddDialog} className="mt-4" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Zone
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center"># Branches</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {zone.code}
                    </TableCell>
                    <TableCell>{zone.name}</TableCell>
                    <TableCell className="text-center">
                      {zone._count.branches}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(zone.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(zone)}
                          title="Edit zone"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(zone)}
                          title="Delete zone"
                          disabled={zone._count.branches > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingZone ? "Edit Zone" : "Add Zone"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="zone-code">Code</Label>
              <Input
                id="zone-code"
                placeholder="e.g., WEST or ZONE-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="zone-name">Name</Label>
              <Input
                id="zone-name"
                placeholder="e.g., Western Zone"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingZone ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete zone &ldquo;{deletingZone?.name}
              &rdquo; ({deletingZone?.code})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
