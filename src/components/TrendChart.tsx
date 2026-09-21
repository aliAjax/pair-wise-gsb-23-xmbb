import { ReadingPoint } from "../domain";

interface Props {
  series: ReadingPoint[];
  limit: number | null;
  rising: boolean;
  overLimit: boolean;
}

const W = 300;
const H = 100;
const PAD_X = 10;
const PAD_Y = 14;

/** 过滤器压差趋势：折线 + 区域上限虚线 + 末点状态着色 */
export function TrendChart({ series, limit, rising, overLimit }: Props) {
  if (series.length === 0) {
    return <p className="empty-hint">暂无巡检读数</p>;
  }

  const maxValue = Math.max(
    ...series.map((p) => p.reading),
    limit ?? 0,
    1,
  );
  const top = maxValue * 1.12;
  const xStep = series.length > 1 ? (W - PAD_X * 2) / (series.length - 1) : 0;
  const xy = (p: ReadingPoint, i: number) => ({
    x: PAD_X + i * xStep,
    y: H - PAD_Y - (p.reading / top) * (H - PAD_Y * 2),
  });

  const points = series.map(xy);
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const limitY = limit !== null ? H - PAD_Y - (limit / top) * (H - PAD_Y * 2) : null;
  const lastColor = overLimit ? "#e11d48" : rising ? "#d97706" : "#0f766e";

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="压差趋势">
      {limitY !== null && (
        <>
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={limitY}
            y2={limitY}
            stroke="#e11d48"
            strokeWidth={1.2}
            strokeDasharray="5 4"
          />
          <text x={W - PAD_X} y={limitY - 4} textAnchor="end" fontSize={10} fill="#e11d48">
            上限 {limit}Pa
          </text>
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={lastColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return (
          <circle
            key={series[i].inspectionId}
            cx={p.x}
            cy={p.y}
            r={isLast ? 4 : 2.6}
            fill={isLast ? lastColor : "#ffffff"}
            stroke={lastColor}
            strokeWidth={1.6}
          >
            <title>
              {new Date(series[i].createdAt).toLocaleString()} · {series[i].reading}Pa
            </title>
          </circle>
        );
      })}
      {last && (
        <text x={Math.min(last.x + 6, W - 4)} y={last.y - 7} fontSize={10} fill={lastColor} fontWeight={700}>
          {series[series.length - 1].reading}Pa
        </text>
      )}
    </svg>
  );
}
