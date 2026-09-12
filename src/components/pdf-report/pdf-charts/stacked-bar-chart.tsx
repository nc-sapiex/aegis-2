import { Canvas, StyleSheet } from "@react-pdf/renderer";

interface Segment {
  value: number;
  color: string;
  label: string;
}

interface StackedBarDatum {
  label: string;
  segments: Segment[];
}

interface StackedBarChartProps {
  data: StackedBarDatum[];
  width: number;
  height: number;
}

const LABEL_AREA = 22;
const LEGEND_AREA = 24;

const styles = StyleSheet.create({
  canvas: {
    marginVertical: 4,
  },
});

/**
 * Stacked bar chart using React-PDF Canvas primitives.
 * Each bar shows segments stacked horizontally.
 */
export function StackedBarChart({ data, width, height }: StackedBarChartProps) {
  if (data.length === 0) return null;

  // Collect unique legend items from first datum
  const legendItems =
    data[0]?.segments.map((s) => ({
      color: s.color,
      label: s.label,
    })) ?? [];

  return (
    <Canvas
      style={[styles.canvas, { width, height }]}
      paint={(painter, availableWidth, availableHeight) => {
        const chartHeight = availableHeight - LABEL_AREA - LEGEND_AREA;
        const barHeight = Math.min(
          (chartHeight - (data.length - 1) * 6) / data.length,
          24,
        );
        const startY = (chartHeight - data.length * (barHeight + 6) + 6) / 2;

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const total = d.segments.reduce((s, seg) => s + seg.value, 0);
          if (total === 0) continue;

          const y = startY + i * (barHeight + 6);
          let offsetX = 60; // Reserve space for label
          const barMaxWidth = availableWidth - 70;

          // Category label
          painter
            .fillColor("#374151")
            .fontSize(7)
            .text(d.label, 0, y + barHeight / 2 - 4, {
              width: 56,
              align: "right",
            });

          // Stacked segments
          for (const seg of d.segments) {
            const segWidth = (seg.value / total) * barMaxWidth;
            if (segWidth > 0) {
              painter
                .fillColor(seg.color)
                .rect(offsetX, y, segWidth, barHeight)
                .fill();

              // Value label inside segment if wide enough
              if (segWidth > 18) {
                painter
                  .fillColor("#FFFFFF")
                  .fontSize(6)
                  .text(String(seg.value), offsetX, y + barHeight / 2 - 3, {
                    width: segWidth,
                    align: "center",
                  });
              }

              offsetX += segWidth;
            }
          }
        }

        // Legend at bottom
        let legendX = 10;
        const legendY = availableHeight - LEGEND_AREA + 8;

        for (const item of legendItems) {
          // Color swatch
          painter.fillColor(item.color).rect(legendX, legendY, 8, 8).fill();

          // Legend text
          painter
            .fillColor("#6B7280")
            .fontSize(6)
            .text(item.label, legendX + 10, legendY, {
              width: 60,
            });

          legendX += 70;
        }

        return null;
      }}
    />
  );
}
