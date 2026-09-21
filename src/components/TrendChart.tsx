import type { Reading, Room } from "../domain";

interface Props {
  readings: Reading[];
  room: Room;
  lockedResistance?: number;
  height?: number;
}

const KIND_LABEL: Record<Reading["kind"], string> = {
  inspection: "巡检",
  retest: "复测",
  amend: "补录",
};

/** 压差趋势折线图：含区域上限参考线、更换前锁定线，补录点用空心标记且不改变趋势 */
export function TrendChart({ readings, room, lockedResistance, height = 190 }: Props) {
  const width = 620;
  const pad = { top: 18, right: 18, bottom: 34, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxVal = Math.max(
    room.dpLimit,
    lockedResistance ?? 0,
    ...readings.map((r) => r.resistance),
    1
  );
  // y 轴留出 12% 顶部空间
  const yMax = Math.ceil((maxVal * 1.12) / 50) * 50;
  const yMin = 0;

  const x = (i: number) =>
    readings.length <= 1 ? pad.left + innerW / 2 : pad.left + (i * innerW) / (readings.length - 1);
  const y = (v: number) => pad.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const linePath = readings
    .map((r, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(r.resistance).toFixed(1)}`)
    .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMin + t * (yMax - yMin)));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="压差趋势图">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(t)}
            y2={y(t)}
            className="trend-grid"
          />
          <text x={pad.left - 8} y={y(t) + 4} className="trend-axis-text" textAnchor="end">
            {t}
          </text>
        </g>
      ))}

      {/* 区域上限线 */}
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={y(room.dpLimit)}
        y2={y(room.dpLimit)}
        className="trend-limit"
      />
      <text x={width - pad.right} y={y(room.dpLimit) - 5} className="trend-limit-text" textAnchor="end">
        区域上限 {room.dpLimit} Pa
      </text>

      {/* 更换前锁定线 */}
      {lockedResistance != null && (
        <>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(lockedResistance)}
            y2={y(lockedResistance)}
            className="trend-lock"
          />
          <text x={pad.left + 4} y={y(lockedResistance) - 5} className="trend-lock-text">
            锁定 {lockedResistance} Pa
          </text>
        </>
      )}

      <path d={linePath} className="trend-line" />

      {readings.map((r, i) => {
        const cx = x(i);
        const cy = y(r.resistance);
        const over = r.resistance > room.dpLimit;
        return (
          <g key={r.id}>
            <circle
              cx={cx}
              cy={cy}
              r={r.kind === "inspection" ? 4 : 5}
              className={
                r.kind === "amend"
                  ? "trend-point trend-point-amend"
                  : over
                    ? "trend-point trend-point-over"
                    : r.kind === "retest"
                      ? "trend-point trend-point-retest"
                      : "trend-point"
              }
            />
            <title>
              {`${r.at} · ${KIND_LABEL[r.kind]} · ${r.resistance} Pa`}
              {r.reason ? ` · 补录原因：${r.reason}` : ""}
            </title>
            <text x={cx} y={height - 12} className="trend-x-text" textAnchor="middle">
              {r.at.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
