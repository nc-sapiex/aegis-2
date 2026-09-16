import {
  getBranchRiskHeatmap,
  getAuditPlanProgress,
  getComplianceAging,
  getFindingTrends,
} from "@/data-access/analytics";
import { RiskHeatmap } from "@/components/analytics/risk-heatmap";
import { PlanProgress } from "@/components/analytics/plan-progress";
import { ComplianceAging } from "@/components/analytics/compliance-aging";
import { FindingTrends } from "@/components/analytics/finding-trends";
import { getRbiaAnalyticsSummary } from "@/data-access/rbia-analytics";
import { RbiaAnalyticsKpis } from "@/components/rbia/rbia-analytics-kpis";
import { RbiaModuleRadarChart } from "@/components/rbia/rbia-analytics-radar";
import { RbiaRatingDistribution } from "@/components/rbia/rbia-rating-distribution";
import { requireAnyPermission } from "@/lib/guards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AnalyticsPage() {
  // CAE or CEO can view analytics
  const session = await requireAnyPermission([
    "dashboard:cae",
    "dashboard:ceo",
  ]);
  const tenantId = session.user.tenantId;

  // Fetch all analytics data
  const [
    branchRiskData,
    planProgressData,
    complianceAgingData,
    findingTrendsData,
    rbiaData,
  ] = await Promise.all([
    getBranchRiskHeatmap(tenantId),
    getAuditPlanProgress(tenantId),
    getComplianceAging(tenantId),
    getFindingTrends(tenantId),
    getRbiaAnalyticsSummary(session),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground">
          Comprehensive insights into audit performance, compliance, and risk
          metrics
        </p>
      </div>

      <Tabs defaultValue="risk" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:grid-cols-5">
          <TabsTrigger value="risk">Branch Risk</TabsTrigger>
          <TabsTrigger value="plan">Audit Plans</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="rbia">RBIA Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="risk" className="space-y-4">
          <RiskHeatmap data={branchRiskData} />
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          <PlanProgress data={planProgressData} />
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <ComplianceAging data={complianceAgingData} />
        </TabsContent>

        <TabsContent value="findings" className="space-y-4">
          <FindingTrends data={findingTrendsData} />
        </TabsContent>

        <TabsContent value="rbia" className="space-y-6">
          {rbiaData.totalAudited === 0 ? (
            <div className="text-muted-foreground flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm">
              No RBIA audits completed yet. RBIA analytics will appear after the
              first engagement score is frozen.
            </div>
          ) : (
            <>
              {/* TODO: Period selector using getRbiaAnalyticsByPeriod */}

              {/* KPI Cards */}
              <RbiaAnalyticsKpis
                totalAudited={rbiaData.totalAudited}
                averageComposite={rbiaData.averageComposite}
                branchesInPoorModerate={
                  (rbiaData.ratingDistribution.POOR ?? 0) +
                  (rbiaData.ratingDistribution.MODERATE ?? 0)
                }
                scoreImprovement={null}
              />

              {/* Charts row */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* RadarChart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Module Scores by Branch</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RbiaModuleRadarChart
                      branches={rbiaData.scores.map((s) => ({
                        branchId: s.branchId,
                        branchName: s.branchName,
                        moduleScores: s.moduleScores,
                      }))}
                    />
                  </CardContent>
                </Card>

                {/* Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Branch Rating Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RbiaRatingDistribution
                      distribution={[
                        {
                          band: "Very Good",
                          count: rbiaData.ratingDistribution.VERY_GOOD ?? 0,
                          color: "hsl(142 60% 35%)",
                        },
                        {
                          band: "Good",
                          count: rbiaData.ratingDistribution.GOOD ?? 0,
                          color: "hsl(213 90% 55%)",
                        },
                        {
                          band: "Satisfactory",
                          count: rbiaData.ratingDistribution.SATISFACTORY ?? 0,
                          color: "hsl(45 96% 56%)",
                        },
                        {
                          band: "Moderate",
                          count: rbiaData.ratingDistribution.MODERATE ?? 0,
                          color: "hsl(25 95% 53%)",
                        },
                        {
                          band: "Poor",
                          count: rbiaData.ratingDistribution.POOR ?? 0,
                          color: "hsl(0 84% 60%)",
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
