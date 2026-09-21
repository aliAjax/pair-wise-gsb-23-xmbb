import { useMemo, useState } from "react";
import type { AppState, DpLevel } from "../domain";
import { batchOf, dpLevel, isRising, latestReading, openWorkOrder, readingsOf, roomOf } from "../domain";
import { TrendChart } from "./TrendChart";
import { Badge, EmptyState } from "./ui";

const LEVEL_BADGE: Record<DpLevel, { tone: "ok" | "warn" | "danger"; text: string }> = {
  normal: { tone: "ok", text: "正常" },
  rising: { tone: "warn", text: "连续上升" },
  overLimit: { tone: "danger", text: "超过上限" },
};

const KIND_LABEL = { inspection: "巡检", retest: "复测", amend: "补录" } as const;

export function TrendTab({ state }: { state: AppState }) {
  const [filterId, setFilterId] = useState(state.filters[0]?.id ?? "");
  const current = state.filters.find((f) => f.id === filterId) ?? state.filters[0];

  const rows = useMemo(
    () =>
      state.filters.map((f) => ({
        filter: f,
        room: roomOf(state, f.roomId)!,
        level: dpLevel(state, f.id),
        latest: latestReading(state, f.id),
        open: openWorkOrder(state, f.id),
      })),
    [state]
  );

  if (!current) return <EmptyState text="暂无过滤器数据" />;

  const room = roomOf(state, current.roomId)!;
  const readings = readingsOf(state, current.id);
  const level = dpLevel(state, current.id);
  const latest = latestReading(state, current.id);
  const open = openWorkOrder(state, current.id);
  const batch = batchOf(state, current.installedBatchId);
  const locked = open?.lockedResistance;
  const rising = isRising(readings);

  return (
    <div className="trend-layout">
      <aside className="panel trend-list">
        <div className="section-heading">
          <div>
            <p>压差趋势</p>
            <h2>过滤器</h2>
          </div>
        </div>
        {rows.map(({ filter, room: r, level: lv, latest: lt, open: op }) => (
          <button
            key={filter.id}
            type="button"
            className={`filter-row ${filter.id === current.id ? "is-active" : ""}`}
            onClick={() => setFilterId(filter.id)}
          >
            <div>
              <strong>{filter.id}</strong>
              <span>
                {r.id} · {filter.spec}
              </span>
            </div>
            <div className="filter-row-right">
              <Badge tone={LEVEL_BADGE[lv].tone}>{LEVEL_BADGE[lv].text}</Badge>
              <span className="filter-row-value">{lt ? `${lt.resistance} Pa` : "无读数"}</span>
              {op && <Badge tone="info">{op.status}</Badge>}
            </div>
          </button>
        ))}
      </aside>

      <section className="panel trend-detail">
        <div className="section-heading">
          <div>
            <p>{room.id} · {room.name}</p>
            <h2>
              {current.id} 压差趋势
              <Badge tone={LEVEL_BADGE[level].tone}>{LEVEL_BADGE[level].text}</Badge>
            </h2>
          </div>
          <div className="detail-meta">
            <span>洁净等级：{room.isoClass}</span>
            <span>
              装机批次：
              {batch ? (
                <>
                  {batch.id}
                  {batch.expiry < "2026-09-21" ? <Badge tone="danger">已过期</Badge> : null}
                </>
              ) : (
                "—"
              )}
            </span>
            {open && <Badge tone="info">{open.id} · {open.status}</Badge>}
          </div>
        </div>

        {readings.length === 0 ? (
          <EmptyState text="该过滤器暂无读数，请到「巡检登记」提交首次巡检" />
        ) : (
          <>
            <TrendChart readings={readings} room={room} lockedResistance={locked} />
            <div className="trend-legend">
              <span><i className="dot dot-inspection" /> 巡检</span>
              <span><i className="dot dot-retest" /> 复测</span>
              <span><i className="dot dot-amend" /> 补录（保留旧值，不参与趋势）</span>
              <span><i className="line-dash line-limit" /> 区域上限</span>
              {locked != null && <span><i className="line-dash line-lock" /> 更换前锁定值</span>}
            </div>
            <p className={`trend-hint ${rising || level === "overLimit" ? "is-hot" : ""}`}>
              {level === "overLimit"
                ? `最新读数 ${latest?.resistance} Pa 已超过区域上限 ${room.dpLimit} Pa`
                : rising
                  ? `最近 3 次读数严格递增，判定为压差连续上升`
                  : `压差未连续上升，且未超过区域上限 ${room.dpLimit} Pa`}
            </p>

            <div className="reading-table-wrap">
              <table className="reading-table">
                <thead>
                  <tr>
                    <th>读数号</th>
                    <th>日期</th>
                    <th>类型</th>
                    <th>初阻力(Pa)</th>
                    <th>运行时长(h)</th>
                    <th>设备状态</th>
                    <th>备注 / 补录原因</th>
                  </tr>
                </thead>
                <tbody>
                  {[...readings].reverse().map((r) => (
                    <tr key={r.id} className={r.kind === "amend" ? "row-amend" : r.kind === "retest" ? "row-retest" : ""}>
                      <td>{r.id}</td>
                      <td>{r.at}</td>
                      <td>{KIND_LABEL[r.kind]}</td>
                      <td className={r.resistance > room.dpLimit ? "text-danger" : undefined}>
                        {r.resistance}
                      </td>
                      <td>{r.runHours}</td>
                      <td>{r.status}</td>
                      <td>{r.reason ? `补录：${r.reason}` : r.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
