import type { AppState, Batch, BatchFit } from "../domain";
import { BUSINESS_DATE, EXPIRING_SOON_DAYS, batchFit, batchFitLabel, daysBetween, filtersOnBatch } from "../domain";
import { Badge } from "./ui";

function overallFit(batch: Batch): { fit: BatchFit; tone: "ok" | "warn" | "danger" } {
  if (batch.expiry < BUSINESS_DATE) return { fit: "expired", tone: "danger" };
  if (batch.stock <= 0) return { fit: "empty", tone: "warn" };
  if (daysBetween(BUSINESS_DATE, batch.expiry) <= EXPIRING_SOON_DAYS) return { fit: "expiring", tone: "warn" };
  return { fit: "ok", tone: "ok" };
}

export function BatchesTab({ state }: { state: AppState }) {
  const totalStock = state.batches.reduce((s, b) => s + b.stock, 0);
  const totalOccupied = state.batches.reduce((s, b) => s + b.occupied, 0);
  const installedCount = state.filters.filter((f) => f.installedBatchId).length;

  return (
    <div className="batch-tab">
      <div className="batch-summary">
        <article className="metric-card">
          <span>可用库存合计（支）</span>
          <strong>{totalStock}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>装机占用合计（支）</span>
          <strong>{totalOccupied}</strong>
          <i className="status-watch" />
        </article>
        <article className="metric-card">
          <span>在装过滤器</span>
          <strong>{installedCount}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>占用对账</span>
          <strong>{totalOccupied === installedCount ? "一致" : "异常"}</strong>
          <i className={totalOccupied === installedCount ? "status-ok" : "status-danger"} />
        </article>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>备件批次台账</p>
            <h2>库存 / 占用 / 报废</h2>
          </div>
        </div>
        <div className="reading-table-wrap">
          <table className="reading-table">
            <thead>
              <tr>
                <th>批次号</th>
                <th>规格</th>
                <th>有效期至</th>
                <th>状态</th>
                <th>可用库存</th>
                <th>装机占用</th>
                <th>累计报废</th>
                <th>装机过滤器（占用明细）</th>
              </tr>
            </thead>
            <tbody>
              {state.batches.map((batch) => {
                const { fit, tone } = overallFit(batch);
                const installed = filtersOnBatch(state, batch.id);
                return (
                  <tr key={batch.id} className={fit === "expired" ? "row-expired" : fit === "expiring" ? "row-expiring" : ""}>
                    <td><strong>{batch.id}</strong></td>
                    <td>{batch.spec}</td>
                    <td>
                      {batch.expiry}
                      {fit === "expiring" && <small className="muted">（剩 {daysBetween(BUSINESS_DATE, batch.expiry)} 天）</small>}
                    </td>
                    <td><Badge tone={tone}>{batchFitLabel(batchFit(batch, batch.spec))}</Badge></td>
                    <td>{batch.stock}</td>
                    <td>
                      {batch.occupied}
                      {batch.occupied !== installed.length && (
                        <Badge tone="danger">对账异常 {installed.length}</Badge>
                      )}
                    </td>
                    <td>{batch.scrapped}</td>
                    <td>
                      {installed.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="batch-installed">
                          {installed.map((f) => (
                            <Badge key={f.id} tone="info">
                              {f.id}（{f.roomId}）
                            </Badge>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          规则：更换时新批次「库存 -1、占用 +1」，旧批次「占用 -1、报废 +1」（拆下报废不回库）；
          已过有效期或零库存批次不可选用；临期（{EXPIRING_SOON_DAYS} 天内）批次可领用但有提示。
        </p>
      </section>
    </div>
  );
}
