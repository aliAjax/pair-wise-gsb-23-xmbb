import { useState } from "react";
import { isBatchUsable, openOrderOf, trendOf } from "../domain";
import { useStore } from "../store";
import { Badge, Empty } from "./common";
import { TrendChart } from "./TrendChart";

export function TrendsPanel() {
  const { state, role, manualOrder } = useStore();
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const submitManual = (filterId: string) => {
    if (manualOrder(filterId, reason)) {
      setManualFor(null);
      setReason("");
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>压差趋势</p>
          <h2>过滤器读数与自动建单判定</h2>
        </div>
        <Badge tone="muted">连续上升 = 最近 3 次严格递增</Badge>
      </div>

      <div className="trend-grid">
        {state.filters.map((f) => {
          const room = state.rooms.find((r) => r.id === f.roomId);
          const trend = trendOf(state, f.id);
          const order = openOrderOf(state, f.id);
          const batch = f.installBatchId ? state.batches.find((b) => b.id === f.installBatchId) : null;
          const batchStale = batch ? !isBatchUsable(batch) : false;
          return (
            <article key={f.id} className="trend-card">
              <header>
                <div>
                  <h3>{f.id}</h3>
                  <p className="sub">
                    {room?.id} · {room?.isoClass} · {f.spec}
                  </p>
                </div>
                <div className="badge-stack">
                  {trend.overLimit ? (
                    <Badge tone="danger">超过上限</Badge>
                  ) : trend.rising ? (
                    <Badge tone="warn">连续上升</Badge>
                  ) : (
                    <Badge tone="ok">趋势平稳</Badge>
                  )}
                  {order && <Badge tone="info">工单 {order.status}</Badge>}
                </div>
              </header>

              <TrendChart series={trend.series} limit={trend.limit} rising={trend.rising} overLimit={trend.overLimit} />

              <dl className="kv">
                <div>
                  <dt>当前批次</dt>
                  <dd>
                    {batch ? (
                      <>
                        {batch.id}
                        {batchStale ? <Badge tone="danger">已过期 {batch.expiry}</Badge> : <Badge tone="ok">有效至 {batch.expiry}</Badge>}
                      </>
                    ) : (
                      <Badge tone="muted">无在用批次</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>最新读数</dt>
                  <dd>{trend.latest !== null ? `${trend.latest}Pa / 上限 ${trend.limit}Pa` : "—"}</dd>
                </div>
              </dl>

              <div className="trend-actions">
                {manualFor === f.id ? (
                  <div className="inline-form">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="手工建单原因（必填）"
                    />
                    <button className="primary-action" onClick={() => submitManual(f.id)}>
                      确认建单
                    </button>
                    <button onClick={() => setManualFor(null)}>取消</button>
                  </div>
                ) : order ? (
                  <p className="inline-locked">
                    已有未关闭工单 {order.id}（{order.status}），不重复建单
                  </p>
                ) : (
                  <button
                    disabled={role === "巡检员"}
                    title={role === "巡检员" ? "仅厂务工程师/班组长可手工建单" : undefined}
                    onClick={() => setManualFor(f.id)}
                  >
                    手工建单
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {state.filters.length === 0 && <Empty text="暂无过滤器档案" />}
    </section>
  );
}
