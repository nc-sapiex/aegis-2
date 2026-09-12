"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Trash2, UserPlus, Loader2 } from "lucide-react";
import {
  AssignTeamMemberSchema,
  type AssignTeamMemberInput,
} from "@/actions/audit-execution/schemas";
import {
  assignTeamMember,
  removeTeamMember,
} from "@/actions/audit-execution/assign-team";
import type { AssignableUser, TeamMember } from "@/data-access/audit-teams";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Checkbox } from "@/components/ui/checkbox";

interface TeamAssignmentPanelProps {
  engagementId: string;
  users: AssignableUser[];
  examinationAreas: string[];
  teamMembers: TeamMember[];
  onUpdate: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  LEAD_AUDITOR: "Lead Auditor",
  FIELD_AUDITOR: "Field Auditor",
};

export function TeamAssignmentPanel({
  engagementId,
  users,
  examinationAreas,
  teamMembers,
  onUpdate,
}: TeamAssignmentPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const {
    setValue,
    watch,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<AssignTeamMemberInput>({
    resolver: zodResolver(AssignTeamMemberSchema) as any,
    defaultValues: {
      engagementId,
      userId: "",
      roleInEngagement: "FIELD_AUDITOR",
      assignedSections: [],
    },
  });

  const selectedSections = watch("assignedSections");

  const onSubmit = async (data: AssignTeamMemberInput) => {
    const result = await assignTeamMember(data);

    if (result.success) {
      toast.success("Team member assigned successfully");
      reset({
        engagementId,
        userId: "",
        roleInEngagement: "FIELD_AUDITOR",
        assignedSections: [],
      });
      setShowAddForm(false);
      onUpdate();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (teamMemberId: string) => {
    setIsRemoving(true);
    const member = teamMembers.find((m: any) => m.id === teamMemberId);
    const result = await removeTeamMember({
      engagementId,
      userId: member?.userId ?? teamMemberId,
    });

    if (result.success) {
      toast.success("Team member removed successfully");
      setRemovingId(null);
      onUpdate();
    } else {
      toast.error(result.error);
    }
    setIsRemoving(false);
  };

  const toggleSection = (section: string) => {
    const current = selectedSections || [];
    if (current.includes(section)) {
      setValue(
        "assignedSections",
        current.filter((s) => s !== section),
      );
    } else {
      setValue("assignedSections", [...current, section]);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Team Assignment</CardTitle>
            <CardDescription>
              Manage team members and their assigned sections
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={isSubmitting}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Team Member
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Team Member Form */}
        {showAddForm && (
          <div className="rounded-lg border p-4">
            <form
              onSubmit={handleSubmit(onSubmit as any)}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                {/* User Selector */}
                <div className="space-y-2">
                  <Label htmlFor="userId">User *</Label>
                  <Select
                    value={watch("userId")}
                    onValueChange={(value) => setValue("userId", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter(
                          (u) => !teamMembers.some((tm) => tm.userId === u.id),
                        )
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Role Selector */}
                <div className="space-y-2">
                  <Label htmlFor="roleInEngagement">Role *</Label>
                  <Select
                    value={watch("roleInEngagement")}
                    onValueChange={(value: "LEAD_AUDITOR" | "FIELD_AUDITOR") =>
                      setValue("roleInEngagement", value)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LEAD_AUDITOR">Lead Auditor</SelectItem>
                      <SelectItem value="FIELD_AUDITOR">
                        Field Auditor
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Section Allocation (Multi-select) */}
              <div className="space-y-2">
                <Label>Assigned Sections</Label>
                <p className="text-muted-foreground text-sm">
                  Select the examination areas this team member will work on
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-4 md:grid-cols-3 lg:grid-cols-4">
                  {examinationAreas.map((section) => (
                    <div
                      key={section}
                      className="flex flex-row items-start space-y-0 space-x-2"
                    >
                      <Checkbox
                        id={`section-${section}`}
                        checked={selectedSections?.includes(section) || false}
                        onCheckedChange={() => toggleSection(section)}
                        disabled={isSubmitting}
                      />
                      <Label
                        htmlFor={`section-${section}`}
                        className="text-sm font-normal"
                      >
                        {section}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Assign
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Team Members Table */}
        {teamMembers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No team members assigned yet. Click "Add Team Member" to get
              started.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Assigned Sections</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.user.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ROLE_LABELS[member.roleInEngagement] ||
                        member.roleInEngagement}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.assignedSections.length === 0 ? (
                      <span className="text-muted-foreground text-sm">
                        No sections assigned
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {member.assignedSections.map((section) => (
                          <Badge key={section} variant="secondary">
                            {section}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemovingId(member.id)}
                    >
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Remove Confirmation Dialog */}
        <AlertDialog
          open={removingId !== null}
          onOpenChange={(open) => !open && setRemovingId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this team member from the
                engagement? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRemoving}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => removingId && handleRemove(removingId)}
                disabled={isRemoving}
              >
                {isRemoving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
