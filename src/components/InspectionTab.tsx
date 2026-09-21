import { useMemo, useState } from "react";
import type { AppState, EquipmentStatus, Outcome } from "../domain";
import { BUSINESS_DATE, EQUIPMENT_STATUSES, latestReading, submitInspection } from "../domain";
import { Badge, Field } from "./ui";

interface Props {
  state: AppState;
  onApply: (outcome: Outcome) => void;
}

const STATUS_TONE: Record<EquipmentStatus, "ok" | "warn" | "danger" | "muted"> = {
  正常: "ok",
  关注: "warn",
  异常: "danger",
  停机: "muted",
};

export function InspectionTab({ state, onApply }: Props) {
  const [roomId, setRoomId] = useState(state.rooms[0]?.id ?? "");
  const [filterId, setFilterId] = useState("");
  const [at, setAt] = useState(BUSINESS_DATE);
  const [resistance, setResistance] = useState("");
  const [runHours, setRunHours] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("正常");
  const [note, setNote] = useState("");

  const roomFilters = useMemo(() => state.filters.filter((f) => f.roomId === roomId), [state.filters, roomId]);
  const effectiveFilterId = filterId && roomFilters.some((f) => f.id === filterId) ? filterId : roomFilters[0]?.id ?? "";
  const selectedFilter = state.filters.find((f) => f.id === effectiveFilterId);
  const room = state.rooms.find((r) => r.id === roomId);
  const last = selectedFilter ? latestReading(state, selectedFilter.id) : undefined;
  const recent = state.readings.slice().reverse().slice(0, 8);

  function changeRoom(value: string) {
    setRoomId(value);
    setFilterId("");
    setResistance("");
    setRunHours("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedFilter || !room) return;
    onApply(
      submitInspection(state, {
        roomId: room.id,
        filterId: selectedFilter.id,
        at,
        resistance: Number(resistance),
        runHours: Number(runHours),
        status,
        note,
      })
    );
    setNote("");
  }

  return (
    <div className="tab-grid">
      <form className="panel" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p>巡检登记</p>
            <h2>过滤器压差读数</h2>
          </div>
        </div>
        <div className="field-grid">
          <Field label="房间" required>
            <select className="text-input" value={roomId} onChange={(e) => changeRoom(e.target.value)}>
              {state.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} · {r.name}（{r.isoClass}，上限 {r.dpLimit} Pa）
                </option>
              ))}
            </select>
          </Field>
          <Field label="过滤器编号" required hint={selectedFilter ? `规格 ${selectedFilter.spec}` : undefined}>
            <select className="text-input" value={effectiveFilterId} onChange={(e) => setFilterId(e.target.value)}>
              {roomFilters.length === 0 && <option value="">该房间暂无过滤器</option>}
              {roomFilters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}（{f.spec}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="初阻力（Pa）" required hint={room ? `区域上限 ${room.dpLimit} Pa，超过即派单` : undefined}>
            <input
              className="text-input"
              type="number"
              min={0}
              step={1}
              required
              value={resistance}
              onChange={(e) => setResistance(e.target.value)}
              placeholder="如 380"
            />
          </Field>
          <Field label="运行时长（h）" required hint="设备累计运行小时数">
            <input
              className="text-input"
              type="number"
              min={0}
              step={1}
              required
              value={runHours}
              onChange={(e) => setRunHours(e.target.value)}
              placeholder={last ? `上次 ${last.runHours}` : "如 4650"}
            />
          </Field>
          <Field label="登记日期" required>
            <input className="text-input" type="date" required value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="设备状态" required>
            <select className="text-input" value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>
              {EQUIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-grid field-grid--full">
            <Field label="处理备注">
              <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填，如已通知厂务" />
            </Field>
          </div>
        </div>
        <div className="form-actions">
          <button className="primary-action" type="submit">
            提交巡检
          </button>
          {last && (
            <span className="inline-meta">
              上次读数：{last.at} · {last.resistance} Pa · 运行 {last.runHours} h
            </span>
          )}
        </div>
      </form>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>最近登记</p>
            <h2>读数流水</h2>
          </div>
        </div>
        <div className="record-list compact">
          {recent.map((r) => {
            const rRoom = state.rooms.find((x) => x.id === r.roomId);
            const over = rRoom ? r.resistance > rRoom.dpLimit : false;
            return (
              <article key={r.id} className="record-card record-card--row">
                <div className="record-main">
                  <h3>
                    {r.filterId}
                    <span className="record-sub">
                      {r.roomId} · {r.at}
                    </span>
                  </h3>
                  <p>
                    {r.kind === "inspection" ? "巡检" : r.kind === "retest" ? "复测" : "补录"}读数{" "}
                    <strong className={over ? "text-danger" : undefined}>{r.resistance} Pa</strong>
                    {rRoom ? ` / 上限 ${rRoom.dpLimit} Pa` : ""} · 运行 {r.runHours} h
                    {r.reason ? ` · 补录原因：${r.reason}` : ""}
                  </p>
                </div>
                <div className="record-tags">
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  {over && <Badge tone="danger">超限</Badge>}
                  {r.workOrderId && <Badge tone="info">{r.workOrderId}</Badge>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
