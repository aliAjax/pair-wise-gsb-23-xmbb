import { useMemo, useState } from "react";
import {
  batchRemaining,
  evaluateRetest,
  isBatchUsable,
  readingSeries,
} from "../domain";
import { useStore } from "../store";
import { OPEN_STATUSES, WorkOrder } from "../types";
import { Badge, Empty, Select } from "./common";

const STATUS_TONE: Record<WorkOrder["status"], "warn" | "info" | "danger" | "ok" | "muted"> = {
  待派工: "warn",
  已派工: "info",
  更换中: "danger",
  待复测: "danger",
  已关闭: "ok",
  已取消: "muted",
};

export function WorkOrdersPanel() {
  const { state } = useStore();
  const [showHistory, setShowHistory] = useState(false);

  const open = state.orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const history = state.orders.filter((o) => !OPEN_STATUSES.includes(o.status));

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>更换工单闭环</p>
          <h2>派工 · 锁定 · 备件更换 · 复测</h2>
        </div>
        <Badge tone={open.length ? "warn" : "ok"}>{open.length} 张未关闭</Badge>
      </div>

      <div className="order-list">
        {open.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
        {open.length === 0 && <Empty text="当前没有未关闭工单" />}
      </div>

      <div className="history-toggle">
        <button onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "收起历史工单" : `查看历史工单（${history.length}）`}
        </button>
      </div>
      {showHistory && (
        <div className="order-list history">
          {history.map((o) => (
            <ClosedOrderRow key={o.id} order={o} />
          ))}
          {history.length === 0 && <Empty text="暂无历史工单" />}
        </div>
      )}
    </section>
  );
}

function OrderCard({ order }: { order: WorkOrder }) {
  const { state, role, dispatch, lock, replace, retest, cancel } = useStore();
  const filter = state.filters.find((f) => f.id === order.filterId);
  const room = state.rooms.find((r) => r.id === order.roomId);
  const [assignee, setAssignee] = useState("");
  const [batchId, setBatchId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  const canManage = role === "厂务工程师" || role === "班组长";

  // 更换前可锁定的基准读数
  const series = useMemo(() => readingSeries(state, order.filterId), [state, order.filterId]);
  const latestPoint = series[series.length - 1];
  const latestInsp = latestPoint
    ? state.inspections.find((i) => i.id === latestPoint.inspectionId)
    : undefined;

  // 备件候选：仅展示同规格批次，不可用原因直接标注
  const batches = state.batches.filter((b) => b.spec === filter?.spec);
  const selectedBatch = batches.find((b) => b.id === batchId);

  // 更换完成后的复测候选：锁定时间点之后登记的读数
  const lockedInsp = state.inspections.find((i) => i.id === order.lockedInspectionId);
  const retestCandidates = state.inspections
    .filter((i) => i.filterId === order.filterId)
    .filter((i) => (lockedInsp ? i.createdAt > lockedInsp.createdAt : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [retestId, setRetestId] = useState("");
  const effectiveRetestId = retestId || retestCandidates[0]?.id || "";
  const retestPreview =
    order.status === "待复测" && effectiveRetestId
      ? evaluateRetest(state, order, effectiveRetestId)
      : null;

  return (
    <article className={`order-card status-${order.status}`}>
      <header className="order-head">
        <div>
          <h3>
            {order.id}
            <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
          </h3>
          <p className="sub">
            {room?.id}（{room?.isoClass}） · {order.filterId} · {filter?.spec} · 触发原因：
            {order.reason}
          </p>
        </div>
        <div className="order-meta">
          {order.assignee && <Badge tone="info">执行人 {order.assignee}</Badge>}
          <Badge tone="muted">建单 {new Date(order.createdAt).toLocaleDateString()}</Badge>
        </div>
      </header>

      <div className="order-flow">
        <FlowStep active={true} label="自动建单" done={true} />
        <FlowStep active={order.status !== "待派工"} label="派工" done={order.status !== "待派工" && order.status !== "已取消"} />
        <FlowStep active={order.status === "更换中" || order.status === "待复测" || order.status === "已关闭"} label="锁定读数/更换" done={order.status === "待复测" || order.status === "已关闭"} />
        <FlowStep active={order.status === "待复测" || order.status === "已关闭"} label="复测关闭" done={order.status === "已关闭"} last />
      </div>

      <div className="order-body">
        {/* 待派工 */}
        {order.status === "待派工" && (
          <div className="action-row">
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="派发给谁（执行人姓名）"
            />
            <button
              className="primary-action"
              disabled={!canManage || !assignee.trim()}
              title={canManage ? undefined : "仅厂务工程师/班组长可派工"}
              onClick={() => dispatch(order.id, assignee)}
            >
              派工
            </button>
            {!showCancel && canManage && <button onClick={() => setShowCancel(true)}>取消工单</button>}
          </div>
        )}

        {/* 已派工：锁定读数 */}
        {order.status === "已派工" && (
          <div className="action-row">
            <div className="lock-preview">
              {latestInsp ? (
                <span>
                  基准读数：<strong>{latestPoint?.reading}Pa</strong> · 运行{" "}
                  <strong>{latestInsp.runningHours}h</strong> · {latestInsp.equipmentStatus}（巡检{" "}
                  {latestInsp.id}）
                </span>
              ) : (
                <span className="danger-text">该过滤器尚无巡检读数，无法锁定</span>
              )}
            </div>
            <button
              className="primary-action"
              disabled={!canManage || !latestInsp}
              title={canManage ? undefined : "仅厂务工程师/班组长可执行"}
              onClick={() => lock(order.id)}
            >
              更换前锁定读数
            </button>
            {!showCancel && canManage && <button onClick={() => setShowCancel(true)}>取消工单</button>}
          </div>
        )}

        {/* 更换中：选择有效期内批次 */}
        {order.status === "更换中" && (
          <div className="replace-zone">
            <p className="zone-title">
              已锁定 <strong>{order.lockedReading}Pa</strong> / {order.lockedRunningHours}h。选择备件批次完成更换：
            </p>
            <div className="batch-options">
              {batches.map((b) => {
                const usable = isBatchUsable(b);
                const remaining = batchRemaining(b, state.filters);
                const isCurrent = filter?.installBatchId === b.id;
                const selectable = usable && remaining > 0 && !isCurrent;
                const reasons = [
                  !usable ? `已过期（${b.expiry}）` : null,
                  usable && remaining <= 0 ? "余量为 0" : null,
                  isCurrent ? "当前在用批次" : null,
                ]
                  .filter(Boolean)
                  .join("；");
                return (
                  <label key={b.id} className={`batch-option ${batchId === b.id ? "selected" : ""} ${!selectable ? "disabled" : ""}`}>
                    <input
                      type="radio"
                      name={`batch-${order.id}`}
                      value={b.id}
                      disabled={!selectable}
                      checked={batchId === b.id}
                      onChange={() => setBatchId(b.id)}
                    />
                    <span>
                      <strong>{b.id}</strong> · {b.spec} · 余量 {Math.max(remaining, 0)}/{b.totalQty}
                    </span>
                    {selectable ? (
                      <Badge tone="ok">有效期至 {b.expiry}</Badge>
                    ) : (
                      <Badge tone="danger">{reasons}</Badge>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="action-row">
              <span className="swap-hint">
                更换将释放旧批次 <code>{order.oldBatchId ?? filter?.installBatchId ?? "无"}</code>
                {selectedBatch && <> 并占用 <code>{selectedBatch.id}</code></>}
              </span>
              <button
                className="primary-action"
                disabled={!canManage || !batchId}
                title={canManage ? undefined : "仅厂务工程师/班组长可执行"}
                onClick={() => {
                  if (replace(order.id, batchId)) setBatchId("");
                }}
              >
                完成更换，进入复测
              </button>
            </div>
          </div>
        )}

        {/* 待复测：复测未下降不得关闭 */}
        {order.status === "待复测" && (
          <div className="retest-zone">
            <p className="zone-title">
              更换批次 <code>{order.newBatchId}</code>，锁定基准 <strong>{order.lockedReading}Pa</strong>。
              请在巡检登记中录入更换后读数，再执行复测：
            </p>
            <div className="action-row">
              <Select value={effectiveRetestId} onChange={(e) => setRetestId(e.target.value)}>
                {retestCandidates.length === 0 && <option value="">暂无更换后巡检读数</option>}
                {retestCandidates.map((i) => (
                  <option key={i.id} value={i.id}>
                    {new Date(i.createdAt).toLocaleString()} · {i.reading}Pa · {i.equipmentStatus} · {i.id}
                  </option>
                ))}
              </Select>
              {retestPreview &&
                (retestPreview.pass ? (
                  <Badge tone="ok">{retestPreview.message}</Badge>
                ) : (
                  <Badge tone="danger">{retestPreview.message}</Badge>
                ))}
              <button
                className="primary-action"
                disabled={!canManage || !effectiveRetestId || retestPreview?.pass === false}
                title={
                  !canManage
                    ? "仅厂务工程师/班组长可关闭"
                    : retestPreview?.pass === false
                      ? "复测未下降，不得关闭"
                      : undefined
                }
                onClick={() => retest(order.id, effectiveRetestId)}
              >
                复测通过并关闭
              </button>
            </div>
          </div>
        )}

        {showCancel && (
          <div className="action-row cancel-row">
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="取消原因（必填）"
            />
            <button
              disabled={!cancelReason.trim()}
              onClick={() => {
                if (cancel(order.id, cancelReason)) {
                  setShowCancel(false);
                  setCancelReason("");
                }
              }}
            >
              确认取消
            </button>
            <button onClick={() => setShowCancel(false)}>收起</button>
          </div>
        )}
      </div>

      <details className="timeline">
        <summary>处理时间线（{order.events.length}）</summary>
        <ol>
          {order.events.map((ev, i) => (
            <li key={i}>
              <span className="ev-time">{new Date(ev.at).toLocaleString()}</span>
              <span className="ev-type">{ev.type}</span>
              <span className="ev-by">{ev.by}</span>
              <span className="ev-detail">{ev.detail}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function FlowStep({ active, done, label, last }: { active: boolean; done: boolean; label: string; last?: boolean }) {
  return (
    <div className={`flow-step ${active ? "active" : ""} ${done ? "done" : ""} ${last ? "last" : ""}`}>
      <i />
      <span>{label}</span>
    </div>
  );
}

function ClosedOrderRow({ order }: { order: WorkOrder }) {
  const { state } = useStore();
  const retest = state.inspections.find((i) => i.id === order.retestInspectionId);
  return (
    <article className="closed-row">
      <h4>
        {order.id} <Badge tone={order.status === "已关闭" ? "ok" : "muted"}>{order.status}</Badge>
      </h4>
      <p>
        {order.filterId} · {order.reason} · 锁定 {order.lockedReading ?? "—"}Pa
        {order.oldBatchId && <> · 旧批次 <code>{order.oldBatchId}</code></>}
        {order.newBatchId && <> → 新批次 <code>{order.newBatchId}</code></>}
        {retest && <> · 复测 <strong>{retest.reading}Pa</strong></>}
      </p>
    </article>
  );
}
