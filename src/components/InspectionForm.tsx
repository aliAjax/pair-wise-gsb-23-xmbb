import { FormEvent, useMemo, useState } from "react";
import { isReadingLocked, trendOf } from "../domain";
import { useStore } from "../store";
import { EQUIPMENT_STATUSES, EquipmentStatus } from "../types";
import { Badge, Field, Select, TextInput } from "./common";

export function InspectionForm() {
  const { state, role, register } = useStore();
  const [filterId, setFilterId] = useState(state.filters[0]?.id ?? "");
  const [reading, setReading] = useState("");
  const [hours, setHours] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("正常运行");
  const [note, setNote] = useState("");

  const filter = state.filters.find((f) => f.id === filterId);
  const room = filter ? state.rooms.find((r) => r.id === filter.roomId) : undefined;
  const trend = useMemo(() => (filterId ? trendOf(state, filterId) : null), [state, filterId]);
  const locked = filterId ? isReadingLocked(state, filterId) : false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = register({
      filterId,
      reading: Number(reading),
      runningHours: Number(hours),
      equipmentStatus: status,
      note,
      inspector: role,
    });
    if (ok) {
      setReading("");
      setHours("");
      setNote("");
      setStatus("正常运行");
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>巡检登记</p>
          <h2>过滤器巡检读数</h2>
        </div>
      </div>

      <form className="inspection-form" onSubmit={submit}>
        <div className="form-grid form-grid-3">
          <Field label="房间 / 过滤器编号">
            <Select value={filterId} onChange={(e) => setFilterId(e.target.value)}>
              {state.filters.map((f) => {
                const r = state.rooms.find((x) => x.id === f.roomId);
                return (
                  <option key={f.id} value={f.id}>
                    {r?.id} · {f.id}（{f.spec}）
                  </option>
                );
              })}
            </Select>
          </Field>
          <Field label="初阻力 / 实测压差" hint="Pa">
            <TextInput
              type="number"
              min={0}
              step={1}
              required
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              placeholder="如 172"
            />
          </Field>
          <Field label="累计运行时长" hint="h">
            <TextInput
              type="number"
              min={0}
              step={1}
              required
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="如 4810"
            />
          </Field>
          <Field label="设备状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>
              {EQUIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="巡检备注">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="异常现象、处置说明" />
          </Field>
        </div>

        <div className="form-foot">
          <div className="rule-hints">
            {room && <Badge tone="info">区域上限 {room.dpLimit}Pa · {room.isoClass}</Badge>}
            {trend?.rising && <Badge tone="warn">最近 {trend.series.length} 次连续上升</Badge>}
            {trend?.overLimit && <Badge tone="danger">当前读数已超上限</Badge>}
            {locked ? (
              <Badge tone="danger">该过滤器读数已被更换工单锁定，锁定期间不接受新巡检</Badge>
            ) : (
              <Badge tone="muted">超限或连续上升将自动生成待派工工单；已有未关闭工单不重复建单</Badge>
            )}
          </div>
          <button className="primary-action" type="submit" disabled={locked || !filterId}>
            提交巡检
          </button>
        </div>
      </form>
    </section>
  );
}
