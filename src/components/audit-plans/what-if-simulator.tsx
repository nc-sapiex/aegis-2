"use client";

import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  FlaskConical,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  simulatePlan,
  type SimulationResult,
} from "@/actions/audit-plans/simulate-plan";

type Branch = {
  id: string;
  code: string;
  name: string;
  ramScore: number | null;
};

interface WhatIfSimulatorProps {
  branches: Branch[];
}

/**
 * Get fiscal year options (current FY and next 2 FYs).
 */
function getFiscalYearOptions(): string[] {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const fyYear = month < 3 ? year - 1 : year;

  return [
    `${fyYear}-${String(fyYear + 1).slice(2)}`,
    `${fyYear + 1}-${String(fyYear + 2).slice(2)}`,
    `${fyYear + 2}-${String(fyYear + 3).slice(2)}`,
  ];
}

/**
 * What-If Simulation Panel (R53)
 *
 * Allows users to hypothetically adjust RAM scores for branches and
 * see the impact on audit scheduling — frequencies, priorities, and dates.
 * Read-only simulation; no database changes.
 */
export function WhatIfSimulator({ branches }: WhatIfSimulatorProps) {
  const fiscalYearOptions = getFiscalYearOptions();
  const [selectedFY, setSelectedFY] = useState(fiscalYearOptions[0]);
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [summary, setSummary] = useState<{
    totalBranches: number;
    branchesAffected: number;
    highRiskOriginal: number;
    highRiskSimulated: number;
    mediumRiskOriginal: number;
    mediumRiskSimulated: number;
    lowRiskOriginal: number;
    lowRiskSimulated: number;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleScoreChange = (branchId: string, value: string) => {
    const score = parseFloat(value);
    const newOverrides = new Map(overrides);
    if (isNaN(score) || value === "") {
      newOverrides.delete(branchId);
    } else {
      newOverrides.set(branchId, Math.min(5, Math.max(0, score)));
    }
    setOverrides(newOverrides);
  };

  const handleSimulate = async () => {
    if (overrides.size === 0) {
      toast.error("Adjust at least one branch's RAM score to simulate.");
      return;
    }

    setIsSimulating(true);
    setResults(null);
    setSummary(null);

    try {
      const result = await simulatePlan({
        fiscalYear: selectedFY,
        overrides: Array.from(overrides.entries()).map(
          ([branchId, ramScore]) => ({
            branchId,
            ramScore,
          }),
        ),
      });

      if (result.success && result.data) {
        setResults(result.data.results);
        setSummary(result.data.summary);
        toast.success(
          `Simulation complete — ${result.data.summary.branchesAffected} branch(es) affected`,
        );
      } else {
        toast.error(result.error || "Simulation failed");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleReset = () => {
    setOverrides(new Map());
    setResults(null);
    setSummary(null);
  };

  const getPriorityVariant = (
    priority: "HIGH" | "MEDIUM" | "LOW",
  ): "destructive" | "default" | "secondary" => {
    if (priority === "HIGH") return "destructive";
    if (priority === "MEDIUM") return "default";
    return "secondary";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          What-If Simulation
        </CardTitle>
        <CardDescription>
          Adjust RAM scores hypothetically and see how the audit plan changes.
          No changes are saved — this is a read-only planning tool.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <label htmlFor="simFY" className="text-sm font-medium">
              Fiscal Year
            </label>
            <Select value={selectedFY} onValueChange={setSelectedFY}>
              <SelectTrigger id="simFY" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fiscalYearOptions.map((fy) => (
                  <SelectItem key={fy} value={fy}>
                    FY {fy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSimulate}
              disabled={isSimulating || overrides.size === 0}
            >
              {isSimulating ? "Simulating..." : "Run Simulation"}
            </Button>
            {(overrides.size > 0 || results) && (
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Branch Score Overrides */}
        <div>
          <h4 className="mb-3 text-sm font-medium">
            Adjust RAM Scores ({overrides.size} override
            {overrides.size !== 1 ? "s" : ""})
          </h4>
          <div className="max-h-[300px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Current RAM</TableHead>
                  <TableHead className="w-[140px]">Simulated RAM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell>
                      <span className="font-medium">{branch.code}</span>{" "}
                      <span className="text-muted-foreground">
                        {branch.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {branch.ramScore !== null
                        ? Number(branch.ramScore).toFixed(2)
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        placeholder="—"
                        value={overrides.get(branch.id)?.toString() ?? ""}
                        onChange={(e) =>
                          handleScoreChange(branch.id, e.target.value)
                        }
                        className="h-8 w-[100px]"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">
                  {summary.branchesAffected}
                </div>
                <p className="text-muted-foreground text-xs">
                  Branches Affected
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1">
                  <span className="text-destructive text-2xl font-bold">
                    {summary.highRiskOriginal}
                  </span>
                  <ArrowRight className="text-muted-foreground h-4 w-4" />
                  <span className="text-destructive text-2xl font-bold">
                    {summary.highRiskSimulated}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">High Risk</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1">
                  <span className="text-2xl font-bold">
                    {summary.mediumRiskOriginal}
                  </span>
                  <ArrowRight className="text-muted-foreground h-4 w-4" />
                  <span className="text-2xl font-bold">
                    {summary.mediumRiskSimulated}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">Medium Risk</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1">
                  <span className="text-2xl font-bold text-green-600">
                    {summary.lowRiskOriginal}
                  </span>
                  <ArrowRight className="text-muted-foreground h-4 w-4" />
                  <span className="text-2xl font-bold text-green-600">
                    {summary.lowRiskSimulated}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">Low Risk</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Simulation Results */}
        {results && results.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-center">RAM Score</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead className="text-center">Frequency (mo)</TableHead>
                  <TableHead className="text-center">Next Audit</TableHead>
                  <TableHead className="text-center">Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow
                    key={r.branchId}
                    className={
                      r.changed ? "bg-yellow-50 dark:bg-yellow-950/20" : ""
                    }
                  >
                    <TableCell>
                      <span className="font-medium">{r.branchCode}</span>{" "}
                      <span className="text-muted-foreground">
                        {r.branchName}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">
                        {r.originalRamScore?.toFixed(2) ?? "N/A"}
                      </span>
                      <ArrowRight className="text-muted-foreground mx-1 inline h-3 w-3" />
                      <span className="font-medium">
                        {r.simulatedRamScore.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={getPriorityVariant(r.originalPriority)}
                        className="mr-1"
                      >
                        {r.originalPriority}
                      </Badge>
                      <ArrowRight className="text-muted-foreground mx-1 inline h-3 w-3" />
                      <Badge variant={getPriorityVariant(r.simulatedPriority)}>
                        {r.simulatedPriority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">
                        {r.originalFrequency}
                      </span>
                      <ArrowRight className="text-muted-foreground mx-1 inline h-3 w-3" />
                      <span className="font-medium">
                        {r.simulatedFrequency}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      <span className="text-muted-foreground">
                        {format(new Date(r.originalNextAudit), "MMM yyyy")}
                      </span>
                      <ArrowRight className="text-muted-foreground mx-1 inline h-3 w-3" />
                      <span className="font-medium">
                        {format(new Date(r.simulatedNextAudit), "MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.changed ? (
                        r.simulatedFrequency < r.originalFrequency ? (
                          <TrendingUp className="text-destructive inline h-4 w-4" />
                        ) : (
                          <TrendingDown className="inline h-4 w-4 text-green-600" />
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
