import { Canvas, StyleSheet } from "@react-pdf/renderer";

interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  width: number;
  height: number;
  barColor?: string;
}

const DEFAULT_COLOR = "#3B82F6";
const LABEL_AREA = 20;

const styles = StyleSheet.create({
  canvas: {
    marginVertical: 4,
  },
});

/**
 * Vertical bar chart using React-PDF Canvas primitives.
 * No external chart library — pure pdfkit drawing API.
 */
export function BarChart({ data, width, height, barColor }: BarChartProps) {
  if (data.length === 0) return null;

  return (
    <Canvas
      style={[styles.canvas, { width, height }]}
      paint={(painter, availableWidth, availableHeight) => {
        const chartHeight = availableHeight - LABEL_AREA - 14;
        const maxValue = Math.max(...data.map((d) => d.value), 1);
        const barW = Math.min((availableWidth - 20) / data.length - 8, 40);
        const startX = (availableWidth - data.length * (barW + 8) + 8) / 2;

        // Baseline
        painter
          .strokeColor("#D1D5DB")
          .lineWidth(0.5)
          .moveTo(0, chartHeight + 14)
          .lineTo(availableWidth, chartHeight + 14)
          .stroke();

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const barHeight =
            maxValue > 0 ? (d.value / maxValue) * chartHeight : 0;
          const x = startX + i * (barW + 8);
          const y = 14 + (chartHeight - barHeight);
          const color = d.color ?? barColor ?? DEFAULT_COLOR;

          // Bar
          painter.fillColor(color).rect(x, y, barW, barHeight).fill();

          // Value label above bar
          painter
            .fillColor("#374151")
            .fontSize(7)
            .text(String(d.value), x, y - 10, {
              width: barW,
              align: "center",
            });

          // Category label below axis
          painter
            .fillColor("#6B7280")
            .fontSize(6)
            .text(d.label, x - 4, chartHeight + 16, {
              width: barW + 8,
              align: "center",
            });
        }

        return null;
      }}
    />
  );
}
