import { useMemo, useState } from "react";
import { useStore } from "../store";
import { EQUIPMENT_STATUSES, EquipmentStatus, Inspection, RevisionField } from "../types";
import { Badge, Empty, Field, Select, TextInput } from "./common";

const FIELD_LABEL: Record<RevisionField, string> = {
  reading: "初阻力",
  runningHours: "运行时长",
  equipmentStatus: "设备状态",
};

function statusTone(s: EquipmentStatus): "ok" | "warn" | "danger" {
  return s === "正常运行" ? "ok" : s === "带病运行" ? "warn" : "danger";
}

export function InspectionsPanel() {
  const { state } = useStore();
  const [roomFilter, setRoomFilter] = useState("全部");

  const inspections = useMemo(() => {
    const list =
      roomFilter === "全部"
        ? state.inspections
        : state.inspections.filter((i) => i.roomId === roomFilter);
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state, roomFilter]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>巡检台账</p>
          <h2>读数与补录留痕</h2>
        </div>
        <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
          <option value="全部">全部房间</option>
          {state.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
            </option>
          ))}
        </Select>
      </div>

      <div className="insp-list">
        {inspections.map((ins) => (
          <InspectionRow key={ins.id} ins={ins} />
        ))}
        {inspections.length === 0 && <Empty text="暂无巡检记录" />}
      </div>
    </section>
  );
}

function InspectionRow({ ins }: { ins: Inspection }) {
  const { state, role, amend } = useStore();
  const [editing, setEditing] = useState(false);
  const [reading, setReading] = useState(String(ins.reading));
  const [hours, setHours] = useState(String(ins.runningHours));
  const [eqStatus, setEqStatus] = useState<EquipmentStatus>(ins.equipmentStatus);
  const [reason, setReason] = useState("");

  const room = state.rooms.find((r) => r.id === ins.roomId);
  const overLimit = room ? ins.reading > room.dpLimit : false;

  // 是否被工单锁定为基准读数（锁定读数永久不可补录）
  const lockedBy = state.orders.find((o) => o.lockedInspectionId === ins.id);
  const canAmend = role === "厂务工程师" || role === "班组长";

  const submit = () => {
    const ok = amend(
      ins.id,
      {
        reading: Number(reading),
        runningHours: Number(hours),
        equipmentStatus: eqStatus,
      },
      reason,
    );
    if (ok) {
      setEditing(false);
      setReason("");
    }
  };

  return (
    <article className="insp-card">
      <header>
        <div>
          <h4>
            {ins.filterId} <span className="muted-text">· {ins.roomId}（{room?.isoClass}）</span>
          </h4>
          <p className="sub">{new Date(ins.createdAt).toLocaleString()} · {ins.inspector} 登记</p>
        </div>
        <div className="badge-stack">
          <Badge tone={overLimit ? "danger" : "ok"}>
            {ins.reading}Pa{room ? ` / 上限 ${room.dpLimit}` : ""}
          </Badge>
          <Badge tone={statusTone(ins.equipmentStatus)}>{ins.equipmentStatus}</Badge>
          <Badge tone="muted">{ins.runningHours}h</Badge>
          {lockedBy && <Badge tone="danger">已被 {lockedBy.id} 锁定</Badge>}
        </div>
      </header>

      {ins.note && <p className="insp-note">{ins.note}</p>}

      {ins.revisions.length > 0 && (
        <ul className="revision-list">
          {ins.revisions.map((rev, i) => (
            <li key={i}>
              <Badge tone="warn">补录</Badge>
              <span>
                {FIELD_LABEL[rev.field]}：<del>{rev.oldValue}</del> → <strong>{rev.newValue}</strong>
              </span>
              <span className="rev-reason">原因：{rev.reason}</span>
              <span className="muted-text">
                {rev.revisedBy} · {new Date(rev.revisedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!editing ? (
        <div className="insp-foot">
          <button
            disabled={!canAmend}
            title={canAmend ? undefined : "仅厂务工程师/班组长可补录"}
            onClick={() => setEditing(true)}
          >
            补录修正
          </button>
          <span className="muted-text">补录必须填写原因，旧值保留在留痕中</span>
        </div>
      ) : (
        <div className="amend-form">
          <div className="form-grid form-grid-4">
            <Field label="新初阻力" hint="Pa">
              <TextInput type="number" value={reading} onChange={(e) => setReading(e.target.value)} />
            </Field>
            <Field label="新运行时长" hint="h">
              <TextInput type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label="新设备状态">
              <Select value={eqStatus} onChange={(e) => setEqStatus(e.target.value as EquipmentStatus)}>
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="补录原因（必填）">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：抄表错误/仪表校准" />
            </Field>
          </div>
          <div className="action-row">
            {lockedBy && <Badge tone="danger">该读数已被 {lockedBy.id} 锁定，读数不可改；其余字段可补录</Badge>}
            <button className="primary-action" disabled={!reason.trim()} onClick={submit}>
              提交补录
            </button>
            <button onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}
    </article>
  );
}
