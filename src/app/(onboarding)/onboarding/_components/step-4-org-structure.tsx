"use client";

/**
 * Step 4: Organization Structure
 *
 * Collects departments and branches via manual entry forms.
 * Features:
 * - Tabbed UI for Departments and Branches sections
 * - Dynamic add/remove rows for each
 * - Default entries: Audit department, Head Office branch
 * - Validation: min 1 department, min 1 branch, at least 1 HO branch
 * - Auto-saves to Zustand store (debounced 500ms)
 * - Loads existing data from store on mount
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import type { DepartmentEntry, BranchEntry } from "@/types/onboarding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Building2,
  Info,
  AlertTriangle,
  FileSpreadsheet,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ExcelUploadZone } from "./excel-upload-zone";

// ─── Constants ──────────────────────────────────────────────────────────────

const BRANCH_TYPES = [
  { value: "HO", label: "Head Office" },
  { value: "Branch", label: "Branch" },
  { value: "Extension Counter", label: "Extension Counter" },
] as const;

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Puducherry",
];

const DEFAULT_DEPARTMENT: DepartmentEntry = {
  name: "Audit",
  code: "AUD",
  headName: "",
  headEmail: "",
};

const DEFAULT_BRANCH: BranchEntry = {
  name: "Head Office",
  code: "HO",
  city: "",
  state: "",
  type: "HO",
  managerName: "",
  managerEmail: "",
};

function createEmptyDepartment(): DepartmentEntry {
  return { name: "", code: "", headName: "", headEmail: "" };
}

function createEmptyBranch(): BranchEntry {
  return {
    name: "",
    code: "",
    city: "",
    state: "",
    type: "Branch",
    managerName: "",
    managerEmail: "",
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StepOrgStructure() {
  const store = useOnboardingStore();

  // Entry method toggle state (manual vs excel)
  const [entryMethod, setEntryMethod] = useState<"manual" | "excel">("manual");

  // Initialize from store or defaults
  const [departments, setDepartments] = useState<DepartmentEntry[]>(() => {
    if (store.orgStructure?.departments?.length) {
      return store.orgStructure.departments;
    }
    return [{ ...DEFAULT_DEPARTMENT }];
  });

  const [branches, setBranches] = useState<BranchEntry[]>(() => {
    if (store.orgStructure?.branches?.length) {
      return store.orgStructure.branches;
    }
    return [{ ...DEFAULT_BRANCH }];
  });

  // Debounced auto-save to store
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToStore = useCallback(
    (depts: DepartmentEntry[], brs: BranchEntry[]) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        store.setOrgStructure({ departments: depts, branches: brs });
      }, 500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Save whenever departments or branches change
  useEffect(() => {
    saveToStore(departments, branches);
  }, [departments, branches, saveToStore]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // ─── Department Handlers ────────────────────────────────────────────────

  const addDepartment = () => {
    setDepartments((prev) => [...prev, createEmptyDepartment()]);
  };

  const removeDepartment = (index: number) => {
    if (departments.length <= 1) return;
    setDepartments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDepartment = (
    index: number,
    field: keyof DepartmentEntry,
    value: string,
  ) => {
    setDepartments((prev) =>
      prev.map((dept, i) => (i === index ? { ...dept, [field]: value } : dept)),
    );
  };

  // ─── Branch Handlers ────────────────────────────────────────────────────

  const addBranch = () => {
    setBranches((prev) => [...prev, createEmptyBranch()]);
  };

  const removeBranch = (index: number) => {
    if (branches.length <= 1) return;
    setBranches((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBranch = (
    index: number,
    field: keyof BranchEntry,
    value: string,
  ) => {
    setBranches((prev) =>
      prev.map((br, i) => (i === index ? { ...br, [field]: value } : br)),
    );
  };

  // ─── Excel Import Handler ───────────────────────────────────────────────

  const handleExcelImport = (data: {
    branches: BranchEntry[];
    departments: DepartmentEntry[];
  }) => {
    if (data.departments.length > 0) {
      setDepartments(data.departments);
    }
    if (data.branches.length > 0) {
      setBranches(data.branches);
    }
    // Switch to manual entry tab so user can review/edit imported data
    setEntryMethod("manual");
  };

  // ─── Validation Helpers ─────────────────────────────────────────────────

  const hasHoBranch = branches.some((b) => b.type === "HO");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Organization Structure
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Manual entry or upload Excel
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entry Method Toggle */}
        <Tabs
          value={entryMethod}
          onValueChange={(val) => setEntryMethod(val as "manual" | "excel")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="excel">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel Upload
            </TabsTrigger>
          </TabsList>

          {/* Manual Entry Tab */}
          <TabsContent value="manual">
            <Tabs defaultValue="departments" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="departments">
                  Departments
                  <Badge variant="secondary" className="ml-2">
                    {departments.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="branches">
                  Branches
                  <Badge variant="secondary" className="ml-2">
                    {branches.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* ─── Departments Tab ─────────────────────────────────────────── */}
              <TabsContent value="departments" className="space-y-4 pt-4">
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Most UCBs have: Credit, Operations, IT, Compliance, Audit,
                    HR, Treasury
                  </p>
                </div>

                <div className="space-y-4">
                  {departments.map((dept, index) => (
                    <div key={index} className="relative rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-muted-foreground text-sm font-medium">
                          Department {index + 1}
                        </span>
                        {departments.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDepartment(index)}
                            className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove department</span>
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`dept-name-${index}`}>
                            Department Name{" "}
                            <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`dept-name-${index}`}
                            placeholder="e.g., Credit Department"
                            value={dept.name}
                            onChange={(e) =>
                              updateDepartment(index, "name", e.target.value)
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`dept-code-${index}`}>
                            Code <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`dept-code-${index}`}
                            placeholder="e.g., CRD (2-10 chars)"
                            value={dept.code}
                            onChange={(e) => {
                              const val = e.target.value
                                .toUpperCase()
                                .slice(0, 10);
                              updateDepartment(index, "code", val);
                            }}
                            maxLength={10}
                          />
                          {dept.code.length > 0 && dept.code.length < 2 && (
                            <p className="text-xs text-red-600">
                              Code must be at least 2 characters
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`dept-head-name-${index}`}>
                            Head of Department
                          </Label>
                          <Input
                            id={`dept-head-name-${index}`}
                            placeholder="Full name"
                            value={dept.headName}
                            onChange={(e) =>
                              updateDepartment(
                                index,
                                "headName",
                                e.target.value,
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`dept-head-email-${index}`}>
                            Head Email
                          </Label>
                          <Input
                            id={`dept-head-email-${index}`}
                            type="email"
                            placeholder="head@bank.com"
                            value={dept.headEmail}
                            onChange={(e) =>
                              updateDepartment(
                                index,
                                "headEmail",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDepartment}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Department
                </Button>
              </TabsContent>

              {/* ─── Branches Tab ────────────────────────────────────────────── */}
              <TabsContent value="branches" className="space-y-4 pt-4">
                {!hasHoBranch && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      At least one branch must be designated as Head Office
                      (HO).
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  {branches.map((branch, index) => (
                    <div
                      key={index}
                      className={cn(
                        "relative rounded-lg border p-4",
                        branch.type === "HO" &&
                          "border-primary/30 bg-primary/5",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm font-medium">
                            Branch {index + 1}
                          </span>
                          {branch.type === "HO" && (
                            <Badge variant="default" className="text-xs">
                              Head Office
                            </Badge>
                          )}
                        </div>
                        {branches.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBranch(index)}
                            className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove branch</span>
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor={`branch-name-${index}`}>
                            Branch Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`branch-name-${index}`}
                            placeholder="e.g., Main Branch"
                            value={branch.name}
                            onChange={(e) =>
                              updateBranch(index, "name", e.target.value)
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`branch-code-${index}`}>
                            Code <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`branch-code-${index}`}
                            placeholder="e.g., BR001"
                            value={branch.code}
                            onChange={(e) =>
                              updateBranch(
                                index,
                                "code",
                                e.target.value.toUpperCase(),
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`branch-type-${index}`}>
                            Type <span className="text-red-500">*</span>
                          </Label>
                          <Select
                            value={branch.type}
                            onValueChange={(val) =>
                              updateBranch(index, "type", val)
                            }
                          >
                            <SelectTrigger id={`branch-type-${index}`}>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {BRANCH_TYPES.map((bt) => (
                                <SelectItem key={bt.value} value={bt.value}>
                                  {bt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`branch-city-${index}`}>
                            City <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`branch-city-${index}`}
                            placeholder="e.g., Mumbai"
                            value={branch.city}
                            onChange={(e) =>
                              updateBranch(index, "city", e.target.value)
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`branch-state-${index}`}>
                            State <span className="text-red-500">*</span>
                          </Label>
                          <Select
                            value={branch.state}
                            onValueChange={(val) =>
                              updateBranch(index, "state", val)
                            }
                          >
                            <SelectTrigger id={`branch-state-${index}`}>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                            <SelectContent>
                              {INDIAN_STATES.map((st) => (
                                <SelectItem key={st} value={st}>
                                  {st}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`branch-manager-name-${index}`}>
                            Manager Name
                          </Label>
                          <Input
                            id={`branch-manager-name-${index}`}
                            placeholder="Full name"
                            value={branch.managerName}
                            onChange={(e) =>
                              updateBranch(index, "managerName", e.target.value)
                            }
                          />
                        </div>

                        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`branch-manager-email-${index}`}>
                            Manager Email
                          </Label>
                          <Input
                            id={`branch-manager-email-${index}`}
                            type="email"
                            placeholder="manager@bank.com"
                            value={branch.managerEmail}
                            onChange={(e) =>
                              updateBranch(
                                index,
                                "managerEmail",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBranch}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Branch
                </Button>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Excel Upload Tab */}
          <TabsContent value="excel">
            <ExcelUploadZone onImport={handleExcelImport} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
