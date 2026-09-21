import { useState } from "react";
import type { AppState, EquipmentStatus, Outcome, WorkOrder } from "../domain";
import {
  BUSINESS_DATE,
  EQUIPMENT_STATUSES,
  batchFit,
  batchFitLabel,
  batchOf,
  closingReading,
  closeWorkOrder,
  dispatchWorkOrder,
  executeReplacement,
  filterOf,
  latestReading,
  lockReading,
  readingsOf,
  replacementBatches,
  roomOf,
  submitAmend,
  submitRetest,
} from "../domain";
import { Badge, EmptyState, Field } from "./ui";

const ASSIGNEES = ["李工", "周师傅", "王工", "赵班组长"];

const STATUS_TONE: Record<WorkOrder["status"], "warn" | "info" | "danger" | "ok"> = {
  待派工: "warn",
  已派工: "info",
  待复测: "danger",
  已关闭: "ok",
};

interface Props {
  state: AppState;
  onApply: (outcome: Outcome) => void;
}

export function WorkOrdersTab({ state, onApply }: Props) {
  const open = state.workOrders.filter((w) => w.status !== "已关闭");
  const closed = state.workOrders.filter((w) => w.status === "已关闭");
  const [selectedId, setSelectedId] = useState<string>(open[0]?.id ?? closed[0]?.id ?? "");
  const selected = state.workOrders.find((w) => w.id === selectedId) ?? open[0];

  const columns: Array<WorkOrder["status"]> = ["待派工", "已派工", "待复测"];

  return (
    <div className="wo-layout">
      <div className="wo-board">
        <div className="wo-columns">
          {columns.map((status) => {
            const items = open.filter((w) => w.status === status);
            return (
              <section key={status} className="panel wo-column">
                <h3 className="wo-column-title">
                  <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                  <span className="wo-count">{items.length}</span>
                </h3>
                {items.length === 0 && <p className="wo-empty">无</p>}
                {items.map((w) => (
                  <WoCard
                    key={w.id}
                    wo={w}
                    state={state}
                    active={selected?.id === w.id}
                    onClick={() => setSelectedId(w.id)}
                  />
                ))}
              </section>
            );
          })}
        </div>
        <section className="panel wo-closed">
          <h3 className="wo-column-title">
            <Badge tone="ok">已关闭</Badge>
            <span className="wo-count">{closed.length}</span>
          </h3>
          <div className="wo-closed-list">
            {closed.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`wo-chip ${selected?.id === w.id ? "is-active" : ""}`}
                onClick={() => setSelectedId(w.id)}
              >
                {w.id} · {w.filterId} · {w.closedAt}
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="panel wo-detail">
        {selected ? (
          <WoDetail key={selected.id} wo={selected} state={state} onApply={onApply} />
        ) : (
          <EmptyState text="暂无工单" />
        )}
      </aside>
    </div>
  );
}

function WoCard({
  wo,
  state,
  active,
  onClick,
}: {
  wo: WorkOrder;
  state: AppState;
  active: boolean;
  onClick: () => void;
}) {
  const room = roomOf(state, wo.roomId);
  const latest = latestReading(state, wo.filterId);
  return (
    <button type="button" className={`wo-card ${active ? "is-active" : ""}`} onClick={onClick}>
      <div className="wo-card-head">
        <strong>{wo.id}</strong>
        <Badge tone={wo.trigger === "超过区域上限" ? "danger" : "warn"}>{wo.trigger}</Badge>
      </div>
      <p>
        {wo.filterId} · {room?.id}
      </p>
      <p className="wo-card-meta">
        最新 {latest ? `${latest.resistance} Pa / 上限 ${room?.dpLimit} Pa` : "无读数"}
        {wo.assignee ? ` · ${wo.assignee}` : ""}
      </p>
    </button>
  );
}

function Timeline({ state, wo }: { state: AppState; wo: WorkOrder }) {
  const steps: Array<{ label: string; at?: string; done: boolean }> = [
    { label: "生成待派工单", at: wo.createdAt, done: true },
    { label: `派工${wo.assignee ? `（${wo.assignee}）` : ""}`, at: wo.dispatchedAt, done: !!wo.dispatchedAt },
    { label: "锁定更换前读数", at: wo.lockedReadingId ? `${wo.lockedReadingId} = ${wo.lockedResistance} Pa` : undefined, done: !!wo.lockedReadingId },
    { label: "备件更换", at: wo.replacedAt ? `${wo.oldBatchId ?? "—"} → ${wo.newBatchId ?? ""}` : undefined, done: !!wo.replacedAt },
    { label: "复测下降", at: wo.retestResistance != null ? `${wo.retestResistance} Pa` : undefined, done: !!closingReading(state, wo) },
    { label: "关闭", at: wo.closedAt, done: wo.status === "已关闭" },
  ];
  return (
    <ol className="timeline">
      {steps.map((s) => (
        <li key={s.label} className={s.done ? "done" : ""}>
          <i />
          <span>{s.label}</span>
          {s.at && <small>{s.at}</small>}
        </li>
      ))}
    </ol>
  );
}

function WoDetail({ wo, state, onApply }: { wo: WorkOrder; state: AppState; onApply: Props["onApply"] }) {
  const room = roomOf(state, wo.roomId);
  const filter = filterOf(state, wo.filterId);
  const oldBatch = batchOf(state, filter?.installedBatchId ?? null);
  const qualifying = closingReading(state, wo);
  const readings = readingsOf(state, wo.filterId).slice().reverse().slice(0, 5);

  return (
    <div className="wo-detail-body">
      <div className="section-heading">
        <div>
          <p>{wo.id}</p>
          <h2>
            {wo.filterId} 更换工单 <Badge tone={STATUS_TONE[wo.status]}>{wo.status}</Badge>
          </h2>
        </div>
      </div>

      <dl className="wo-meta-grid">
        <div><dt>房间</dt><dd>{room?.id} · {room?.name}</dd></div>
        <div><dt>触发原因</dt><dd>{wo.trigger}（{wo.createdAt}）</dd></div>
        <div><dt>区域上限</dt><dd>{room?.dpLimit} Pa</dd></div>
        <div><dt>过滤器规格</dt><dd>{filter?.spec}</dd></div>
        <div><dt>当前装机批次</dt><dd>{filter?.installedBatchId ?? "—"}</dd></div>
        <div><dt>执行人</dt><dd>{wo.assignee ?? "未派工"}</dd></div>
      </dl>

      <Timeline state={state} wo={wo} />

      {wo.status === "待派工" && <DispatchPanel wo={wo} state={state} onApply={onApply} />}
      {wo.status === "已派工" && <ReplacePanel wo={wo} state={state} onApply={onApply} />}
      {wo.status === "待复测" && <RetestPanel wo={wo} state={state} onApply={onApply} />}
      {wo.status === "已关闭" && <ClosedPanel wo={wo} state={state} />}

      <div className="wo-recent">
        <h4>最近读数</h4>
        {readings.map((r) => (
          <div key={r.id} className="wo-recent-row">
            <Badge tone={r.kind === "retest" ? "ok" : r.kind === "amend" ? "warn" : "muted"}>
              {r.kind === "inspection" ? "巡检" : r.kind === "retest" ? "复测" : "补录"}
            </Badge>
            <span>{r.at}</span>
            <strong>{r.resistance} Pa</strong>
            <span className="muted">{r.runHours} h · {r.status}</span>
            {r.id === wo.lockedReadingId && <Badge tone="info">已锁定</Badge>}
          </div>
        ))}
        {wo.status === "待复测" && (
          <p className={`wo-close-hint ${qualifying ? "ok" : ""}`}>
            {qualifying
              ? `复测 ${qualifying.resistance} Pa 已低于锁定 ${wo.lockedResistance} Pa，满足关闭条件`
              : `关闭条件：复测/补录读数需低于锁定值 ${wo.lockedResistance} Pa（当前 ${wo.retestResistance ?? "未复测"} Pa）`}
          </p>
        )}
        {oldBatch && wo.status !== "已关闭" && (
          <p className="muted small">
            提示：更换时旧批次 {oldBatch.id} 将释放 1 个占用并计入报废，不回库存
          </p>
        )}
      </div>
    </div>
  );
}

function DispatchPanel({ wo, state, onApply }: { wo: WorkOrder; state: AppState; onApply: Props["onApply"] }) {
  const [assignee, setAssignee] = useState(ASSIGNEES[0]);
  return (
    <div className="action-panel">
      <h4>① 派工</h4>
      <p className="muted small">同一过滤器只允许存在一张未关闭工单，派工后进入更换前准备。</p>
      <div className="inline-form">
        <Field label="执行人" required>
          <select className="text-input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {ASSIGNEES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <button
          className="primary-action"
          onClick={() => onApply(dispatchWorkOrder(state, wo.id, assignee))}
        >
          确认派工
        </button>
      </div>
    </div>
  );
}

function ReplacePanel({ wo, state, onApply }: { wo: WorkOrder; state: AppState; onApply: Props["onApply"] }) {
  const filter = filterOf(state, wo.filterId)!;
  const candidates = replacementBatches(state, filter);
  const selectable = candidates.filter(({ fit }) => fit === "ok" || fit === "expiring");
  const [batchId, setBatchId] = useState(selectable[0]?.batch.id ?? "");
  const locked = !!wo.lockedReadingId;
  const latest = latestReading(state, wo.filterId);

  return (
    <div className="action-panel">
      <h4>② 更换前锁定与备件领用</h4>
      <div className="lock-row">
        <div>
          <p className="muted small">锁定后以该读数作为复测基准，更换与关闭均不可更改。</p>
          <p>
            当前最新读数：{latest ? `${latest.id} · ${latest.at} · ${latest.resistance} Pa` : "无"}
          </p>
        </div>
        <button
          className="primary-action"
          disabled={locked}
          onClick={() => onApply(lockReading(state, wo.id))}
        >
          {locked ? `已锁定 ${wo.lockedResistance} Pa` : "锁定更换前读数"}
        </button>
      </div>

      <h4>③ 选用有效期内的备件批次</h4>
      <ul className="batch-pick-list">
        {candidates.map(({ batch, fit }) => {
          const usable = fit === "ok" || fit === "expiring";
          const checked = usable && batch.id === batchId;
          return (
            <li key={batch.id} className={checked ? "is-checked" : ""}>
              <label className={usable ? "" : "is-disabled"}>
                <input
                  type="radio"
                  name={`batch-${wo.id}`}
                  value={batch.id}
                  checked={checked}
                  disabled={!usable}
                  onChange={() => setBatchId(batch.id)}
                />
                <span className="batch-id">{batch.id}</span>
                <span className="muted">
                  {batch.spec} · 有效期 {batch.expiry} · 库存 {batch.stock} · 占用 {batch.occupied}
                </span>
                <Badge tone={fit === "ok" ? "ok" : fit === "expiring" ? "warn" : "danger"}>
                  {batchFitLabel(fit)}
                </Badge>
              </label>
            </li>
          );
        })}
      </ul>
      <button
        className="primary-action"
        disabled={!locked || !batchId}
        onClick={() => onApply(executeReplacement(state, wo.id, batchId))}
      >
        执行更换并进入复测
      </button>
      {!locked && <p className="muted small">请先锁定读数，再执行更换。</p>}
    </div>
  );
}

function RetestPanel({ wo, state, onApply }: { wo: WorkOrder; state: AppState; onApply: Props["onApply"] }) {
  const [at, setAt] = useState(BUSINESS_DATE);
  const [resistance, setResistance] = useState("");
  const [runHours, setRunHours] = useState("0");
  const [status, setStatus] = useState<EquipmentStatus>("正常");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"retest" | "amend">("retest");
  const [closeNote, setCloseNote] = useState("");
  const qualifying = closingReading(state, wo);

  function submit() {
    const payload = {
      at,
      resistance: Number(resistance),
      runHours: Number(runHours),
      status,
      note,
      reason,
    };
    onApply(mode === "retest" ? submitRetest(state, wo.id, payload) : submitAmend(state, wo.id, payload));
    setResistance("");
    setNote("");
    setReason("");
  }

  return (
    <div className="action-panel">
      <h4>④ 更换后复测</h4>
      <p className="muted small">
        复测初阻力必须低于锁定值 {wo.lockedResistance} Pa 才允许关闭；未下降时不得关闭。
        若现场先记录了偏差读数，可使用「补录」：必须填写原因，原读数原样保留、不被覆盖。
      </p>
      <div className="mode-switch">
        <button type="button" className={mode === "retest" ? "is-active" : ""} onClick={() => setMode("retest")}>
          正常复测
        </button>
        <button type="button" className={mode === "amend" ? "is-active" : ""} onClick={() => setMode("amend")}>
          补录（带原因）
        </button>
      </div>
      <div className="field-grid">
        <Field label="复测日期" required>
          <input className="text-input" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="复测初阻力（Pa）" required>
          <input
            className="text-input"
            type="number"
            min={0}
            value={resistance}
            onChange={(e) => setResistance(e.target.value)}
            placeholder={`需 < ${wo.lockedResistance}`}
          />
        </Field>
        <Field label="运行时长（h）" required hint="新滤芯从 0 开始累计">
          <input className="text-input" type="number" min={0} value={runHours} onChange={(e) => setRunHours(e.target.value)} />
        </Field>
        <Field label="设备状态" required>
          <select className="text-input" value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {mode === "amend" && (
          <div className="field-grid field-grid--full">
            <Field label="补录原因" required hint="补录不覆盖锁定值与历史读数，仅追加一条带原因的记录">
              <input
                className="text-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="如：仪表未校准导致首次读数偏高"
              />
            </Field>
          </div>
        )}
        <div className="field-grid field-grid--full">
          <Field label="备注">
            <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
      <button className="primary-action" onClick={submit} disabled={mode === "amend" && !reason.trim()}>
        {mode === "retest" ? "提交复测" : "提交补录（保留旧值）"}
      </button>

      <h4>⑤ 关闭工单</h4>
      <div className="inline-form">
        <Field label="关闭备注">
          <input className="text-input" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="选填" />
        </Field>
        <button
          className="primary-action"
          disabled={!qualifying}
          onClick={() => onApply(closeWorkOrder(state, wo.id, closeNote))}
        >
          关闭工单
        </button>
      </div>
    </div>
  );
}

function ClosedPanel({ wo, state }: { wo: WorkOrder; state: AppState }) {
  const newBatch = batchOf(state, wo.newBatchId ?? null);
  const oldBatch = batchOf(state, wo.oldBatchId ?? null);
  return (
    <div className="action-panel closed-panel">
      <h4>闭环记录</h4>
      <dl className="wo-meta-grid">
        <div><dt>锁定读数</dt><dd>{wo.lockedReadingId} · {wo.lockedResistance} Pa</dd></div>
        <div><dt>复测读数</dt><dd>{wo.retestReadingId} · {wo.retestResistance} Pa</dd></div>
        <div><dt>旧批次（已释放）</dt><dd>{wo.oldBatchId ?? "—"}</dd></div>
        <div>
          <dt>新批次（装机占用）</dt>
          <dd>
            {wo.newBatchId}
            {newBatch ? ` · 库存 ${newBatch.stock} / 占用 ${newBatch.occupied}` : ""}
          </dd>
        </div>
        <div><dt>更换日期</dt><dd>{wo.replacedAt}</dd></div>
        <div><dt>关闭日期</dt><dd>{wo.closedAt}</dd></div>
      </dl>
      {wo.closeNote && <p className="muted small">关闭备注：{wo.closeNote}</p>}
      {oldBatch && <p className="muted small">旧批次 {oldBatch.id} 当前累计报废 {oldBatch.scrapped} 支。</p>}
    </div>
  );
}
