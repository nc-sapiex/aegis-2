"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "@/lib/icons";

// ─── RBI Supervisory Rating Color Bands ─────────────────────────────────────

function getRatingColor(score: number): string {
  if (score >= 4) return "hsl(142 71% 45%)"; // 4-5: Good (green)
  if (score >= 3) return "hsl(84 60% 45%)"; // 3-4: Satisfactory (yellow-green)
  if (score >= 2) return "hsl(43 96% 56%)"; // 2-3: Fair (amber)
  return "hsl(0 84% 60%)"; // 1-2: Unsatisfactory (red)
}

function getRatingLabel(score: number): string {
  if (score >= 4) return "Good";
  if (score >= 3) return "Satisfactory";
  if (score >= 2) return "Fair";
  return "Unsatisfactory";
}

// ─── Component ──────────────────────────────────────────────────────────────

interface SupervisoryScoreGaugeProps {
  score: number | null;
}

export function SupervisoryScoreGauge({ score }: SupervisoryScoreGaugeProps) {
  if (score === null || score === undefined) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4" />
            RBI Supervisory Rating
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <Badge variant="secondary" className="mb-2">
              Not yet assessed
            </Badge>
            <p className="text-muted-foreground text-xs">
              RBI supervisory rating will appear after inspection assessment.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const color = getRatingColor(score);
  const label = getRatingLabel(score);

  const chartConfig = {
    rating: { label: "RBI Supervisory Rating", color },
  } satisfies ChartConfig;

  const chartData = [
    { name: "rating", value: score, fill: "var(--color-rating)" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4" />
          RBI Supervisory Rating
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className="mx-auto min-h-[100px] w-full"
            aria-label={`RBI supervisory rating: ${score} out of 5 — ${label}`}
          >
            <RadialBarChart
              accessibilityLayer
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              data={chartData}
            >
              <PolarAngleAxis type="number" domain={[0, 5]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={10} background />
            </RadialBarChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{score.toFixed(1)}</span>
            <span className="text-xs font-medium" style={{ color }}>
              {label}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Backward-compatible export alias
export { SupervisoryScoreGauge as DakshScoreGauge };
