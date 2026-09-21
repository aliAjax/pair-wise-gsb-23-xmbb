// 领域模型与纯业务逻辑：巡检登记、压差趋势判定、工单闭环、备件批次事务
// 所有函数均为纯函数，状态以结构化拷贝方式更新，便于在刷新后做一致性校验。

export const BUSINESS_DATE = "2026-09-21"; // 演示用业务日期（设备/批次有效期均按此判定）
export const RISING_WINDOW = 3; // 连续上升判定窗口：最近 3 次读数严格递增
export const EXPIRING_SOON_DAYS = 60; // 距有效期不足 60 天标记“临期”，仍可选用

export type EquipmentStatus = "正常" | "关注" | "异常" | "停机";
export const EQUIPMENT_STATUSES: EquipmentStatus[] = ["正常", "关注", "异常", "停机"];

export type ReadingKind = "inspection" | "retest" | "amend";
export type WorkOrderStatus = "待派工" | "已派工" | "待复测" | "已关闭";
export type TriggerReason = "超过区域上限" | "压差连续上升";
export type NoticeKind = "ok" | "warn" | "err";

export interface Room {
  id: string;
  name: string;
  isoClass: string;
  dpLimit: number; // 该区域过滤器压差上限（Pa）
}

export interface Filter {
  id: string; // 过滤器编号
  roomId: string;
  spec: string; // 规格，如 H14 / U17
  installedBatchId: string | null; // 当前装机占用的备件批次
  installedAt: string | null;
}

export interface Batch {
  id: string; // 备件批次号
  spec: string;
  expiry: string; // 有效期至 YYYY-MM-DD
  stock: number; // 可用库存（未占用）
  occupied: number; // 装机占用数
  scrapped: number; // 历次更换拆下报废数（已释放占用，不回库）
}

export interface Reading {
  id: string;
  kind: ReadingKind; // inspection 巡检 / retest 复测 / amend 补录
  filterId: string;
  roomId: string;
  at: string; // 读数日期
  resistance: number; // 初阻力（压差读数 Pa）
  runHours: number; // 运行时长（h，累计）
  status: EquipmentStatus; // 设备状态
  note?: string;
  reason?: string; // 补录原因（amend 必填）
  workOrderId?: string; // 关联工单（读数在未关闭工单周期内时记录）
}

export interface WorkOrder {
  id: string;
  filterId: string;
  roomId: string;
  status: WorkOrderStatus;
  trigger: TriggerReason;
  createdAt: string;
  dispatchedAt?: string;
  assignee?: string;
  lockedReadingId?: string; // 更换前锁定的读数
  lockedResistance?: number;
  oldBatchId?: string; // 更换时释放占用的旧批次
  newBatchId?: string; // 更换时选用的新批次
  replacedAt?: string;
  retestReadingId?: string; // 最近一次复测/补录读数
  retestResistance?: number;
  closedAt?: string;
  closeNote?: string;
}

export interface Sequence {
  reading: number;
  workOrder: number;
}

export interface AppState {
  rooms: Room[];
  filters: Filter[];
  batches: Batch[];
  readings: Reading[];
  workOrders: WorkOrder[];
  seq: Sequence;
}

export interface Notice {
  kind: NoticeKind;
  text: string;
}

export interface Outcome {
  state: AppState;
  notices: Notice[];
}

export interface InspectionInput {
  roomId: string;
  filterId: string;
  at: string;
  resistance: number;
  runHours: number;
  status: EquipmentStatus;
  note?: string;
}

// ---------- 基础工具 ----------

export function cloneState(state: AppState): AppState {
  return structuredClone(state);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function readingsOf(state: AppState, filterId: string): Reading[] {
  return state.readings
    .filter((r) => r.filterId === filterId)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
}

export function latestReading(state: AppState, filterId: string): Reading | undefined {
  const list = readingsOf(state, filterId);
  return list.length ? list[list.length - 1] : undefined;
}

export function openWorkOrders(state: AppState): WorkOrder[] {
  return state.workOrders.filter((w) => w.status !== "已关闭");
}

export function openWorkOrder(state: AppState, filterId: string): WorkOrder | undefined {
  return openWorkOrders(state).find((w) => w.filterId === filterId);
}

export function roomOf(state: AppState, roomId: string): Room | undefined {
  return state.rooms.find((r) => r.id === roomId);
}

export function filterOf(state: AppState, filterId: string): Filter | undefined {
  return state.filters.find((f) => f.id === filterId);
}

export function batchOf(state: AppState, batchId: string | null | undefined): Batch | undefined {
  return state.batches.find((b) => b.id === batchId);
}

export function nextReadingId(state: AppState): string {
  return `RD-${String(state.seq.reading).padStart(4, "0")}`;
}

export function nextWorkOrderId(state: AppState): string {
  return `WO-2026-${String(state.seq.workOrder).padStart(3, "0")}`;
}

// ---------- 趋势判定 ----------

/** 连续上升：最近 3 次非补录读数严格递增（补录保留旧值，不参与趋势） */
export function isRising(readings: Reading[]): boolean {
  const seq = readings.filter((r) => r.kind !== "amend");
  if (seq.length < RISING_WINDOW) return false;
  const [a, b, c] = seq.slice(-RISING_WINDOW);
  return b.resistance > a.resistance && c.resistance > b.resistance;
}

export type DpLevel = "normal" | "rising" | "overLimit";

export function dpLevel(state: AppState, filterId: string): DpLevel {
  const filter = filterOf(state, filterId);
  const room = filter ? roomOf(state, filter.roomId) : undefined;
  const latest = latestReading(state, filterId);
  if (!filter || !room || !latest) return "normal";
  if (latest.kind !== "amend" && latest.resistance > room.dpLimit) return "overLimit";
  if (isRising(readingsOf(state, filterId))) return "rising";
  return "normal";
}

/** 更换后可关闭工单的读数：关联本工单的最近一次复测/补录且低于锁定值 */
export function closingReading(state: AppState, wo: WorkOrder): Reading | undefined {
  if (wo.status !== "待复测" || wo.lockedResistance == null) return undefined;
  const candidates = readingsOf(state, wo.filterId).filter(
    (r) => r.kind !== "inspection" && r.workOrderId === wo.id
  );
  const last = candidates[candidates.length - 1];
  return last && last.resistance < wo.lockedResistance ? last : undefined;
}

// ---------- 备件批次 ----------

export type BatchFit = "ok" | "expiring" | "expired" | "empty" | "mismatch";

export function batchFit(batch: Batch, spec: string): BatchFit {
  if (batch.spec !== spec) return "mismatch";
  if (batch.expiry < BUSINESS_DATE) return "expired";
  if (batch.stock <= 0) return "empty";
  if (daysBetween(BUSINESS_DATE, batch.expiry) <= EXPIRING_SOON_DAYS) return "expiring";
  return "ok";
}

export function batchFitLabel(fit: BatchFit): string {
  switch (fit) {
    case "ok":
      return "有效";
    case "expiring":
      return "临期";
    case "expired":
      return "已过有效期";
    case "empty":
      return "无可用库存";
    case "mismatch":
      return "规格不符";
  }
}

/** 可用于更换的批次：规格相符、在有效期内、库存大于 0（临期仍允许但有提示） */
export function replacementBatches(state: AppState, filter: Filter): Array<{ batch: Batch; fit: BatchFit }> {
  return state.batches
    .map((batch) => ({ batch, fit: batchFit(batch, filter.spec) }))
    .sort((a, b) => a.batch.id.localeCompare(b.batch.id));
}

export function filtersOnBatch(state: AppState, batchId: string): Filter[] {
  return state.filters.filter((f) => f.installedBatchId === batchId);
}

// ---------- 业务操作 ----------

function err(text: string, state: AppState): Outcome {
  return { state, notices: [{ kind: "err", text }] };
}

/** 巡检登记：追加不可变读数；超区域上限或连续上升且无未关闭工单时生成待派工单 */
export function submitInspection(prev: AppState, input: InspectionInput): Outcome {
  const room = roomOf(prev, input.roomId);
  if (!room) return err("房间不存在，登记失败", prev);
  const filter = prev.filters.find((f) => f.id === input.filterId && f.roomId === input.roomId);
  if (!filter) return err("该房间下不存在此过滤器编号", prev);
  if (!Number.isFinite(input.resistance) || input.resistance < 0)
    return err("初阻力（压差读数）需为不小于 0 的数值", prev);
  if (!Number.isFinite(input.runHours) || input.runHours < 0)
    return err("运行时长需为不小于 0 的数值", prev);
  if (!input.at) return err("请选择巡检日期", prev);

  const state = cloneState(prev);
  const open = openWorkOrder(state, filter.id);
  const reading: Reading = {
    id: nextReadingId(state),
    kind: "inspection",
    filterId: filter.id,
    roomId: room.id,
    at: input.at,
    resistance: input.resistance,
    runHours: input.runHours,
    status: input.status,
    note: input.note?.trim() || undefined,
    workOrderId: open?.id,
  };
  state.seq.reading += 1;
  state.readings.push(reading);

  const notices: Notice[] = [
    {
      kind: "ok",
      text: `已登记 ${filter.id} 巡检读数 ${reading.resistance} Pa（区域上限 ${room.dpLimit} Pa）`,
    },
  ];

  if (open) {
    notices.push({
      kind: "warn",
      text: `${open.id} 尚未关闭，同一过滤器仅保留一张未关闭工单，本次不重复派单`,
    });
    return { state, notices };
  }

  const exceeded = reading.resistance > room.dpLimit;
  const rising = !exceeded && isRising(readingsOf(state, filter.id));
  if (!exceeded && !rising) return { state, notices };

  const trigger: TriggerReason = exceeded ? "超过区域上限" : "压差连续上升";
  const wo: WorkOrder = {
    id: nextWorkOrderId(state),
    filterId: filter.id,
    roomId: room.id,
    status: "待派工",
    trigger,
    createdAt: input.at,
  };
  state.seq.workOrder += 1;
  state.workOrders.push(wo);
  reading.workOrderId = wo.id;
  notices.push({
    kind: "warn",
    text: exceeded
      ? `读数 ${reading.resistance} Pa 超过区域上限 ${room.dpLimit} Pa，已生成待派工单 ${wo.id}`
      : `最近 ${RISING_WINDOW} 次压差连续上升，已生成待派工单 ${wo.id}`,
  });
  return { state, notices };
}

/** 派工：待派工 → 已派工 */
export function dispatchWorkOrder(prev: AppState, woId: string, assignee: string): Outcome {
  const wo = prev.workOrders.find((w) => w.id === woId);
  if (!wo) return err("工单不存在", prev);
  if (wo.status !== "待派工") return err(`${woId} 当前为「${wo.status}」，不能派工`, prev);
  if (!assignee.trim()) return err("请填写或选择执行人", prev);

  const state = cloneState(prev);
  const target = state.workOrders.find((w) => w.id === woId)!;
  target.status = "已派工";
  target.dispatchedAt = BUSINESS_DATE;
  target.assignee = assignee.trim();
  return {
    state,
    notices: [{ kind: "ok", text: `${woId} 已派工给 ${target.assignee}，下一步：更换前锁定读数` }],
  };
}

/** 更换前锁定当前最新读数，锁定后复测、关闭均以该值为基准 */
export function lockReading(prev: AppState, woId: string): Outcome {
  const wo = prev.workOrders.find((w) => w.id === woId);
  if (!wo) return err("工单不存在", prev);
  if (wo.status !== "已派工") return err(`${woId} 仅在「已派工」状态可锁定读数`, prev);
  const latest = latestReading(prev, wo.filterId);
  if (!latest) return err(`${wo.filterId} 尚无巡检读数，无法锁定`, prev);

  const state = cloneState(prev);
  const target = state.workOrders.find((w) => w.id === woId)!;
  target.lockedReadingId = latest.id;
  target.lockedResistance = latest.resistance;
  return {
    state,
    notices: [{ kind: "ok", text: `${woId} 已锁定更换前读数 ${latest.id} = ${latest.resistance} Pa` }],
  };
}

/**
 * 更换执行（原子事务）：
 * 1. 仅允许选用在有效期内、规格相符、库存充足的批次；
 * 2. 释放旧批次装机占用（occupied-1，scrapped+1，旧过滤器报废不回库）；
 * 3. 新批次 stock-1、occupied+1，过滤器指向新批次；
 * 4. 工单进入「待复测」。
 */
export function executeReplacement(prev: AppState, woId: string, newBatchId: string): Outcome {
  const wo = prev.workOrders.find((w) => w.id === woId);
  if (!wo) return err("工单不存在", prev);
  if (wo.status !== "已派工") return err(`${woId} 当前为「${wo.status}」，不能执行更换`, prev);
  if (wo.lockedReadingId == null || wo.lockedResistance == null)
    return err("请先锁定更换前读数，再执行更换", prev);
  const filter = filterOf(prev, wo.filterId);
  if (!filter) return err("工单关联的过滤器不存在", prev);
  const batch = prev.batches.find((b) => b.id === newBatchId);
  if (!batch) return err("备件批次不存在", prev);
  const fit = batchFit(batch, filter.spec);
  if (fit === "mismatch") return err(`批次 ${batch.id} 规格 ${batch.spec} 与过滤器 ${filter.spec} 不符`, prev);
  if (fit === "expired") return err(`批次 ${batch.id} 已过有效期（${batch.expiry}），禁止领用`, prev);
  if (fit === "empty") return err(`批次 ${batch.id} 可用库存为 0`, prev);

  const state = cloneState(prev);
  const target = state.workOrders.find((w) => w.id === woId)!;
  const targetFilter = state.filters.find((f) => f.id === filter.id)!;
  const targetNew = state.batches.find((b) => b.id === batch.id)!;
  const oldBatchId = targetFilter.installedBatchId;

  if (oldBatchId) {
    const old = state.batches.find((b) => b.id === oldBatchId);
    if (old) {
      old.occupied -= 1;
      old.scrapped += 1;
    }
  }
  targetNew.stock -= 1;
  targetNew.occupied += 1;
  targetFilter.installedBatchId = targetNew.id;
  targetFilter.installedAt = BUSINESS_DATE;

  target.oldBatchId = oldBatchId ?? undefined;
  target.newBatchId = targetNew.id;
  target.replacedAt = BUSINESS_DATE;
  target.status = "待复测";

  const notices: Notice[] = [
    {
      kind: "ok",
      text: `${filter.id} 已更换为批次 ${targetNew.id}（${fit === "expiring" ? "临期批次，" : ""}库存 ${targetNew.stock}、占用 ${targetNew.occupied}）`,
    },
  ];
  if (oldBatchId) {
    const old = state.batches.find((b) => b.id === oldBatchId)!;
    notices.push({
      kind: "ok",
      text: `旧批次 ${oldBatchId} 已释放占用（占用 ${old.occupied}、报废 ${old.scrapped}）`,
    });
  }
  notices.push({ kind: "warn", text: `请复测：新读数低于锁定值 ${wo.lockedResistance} Pa 后才可关闭工单` });
  return { state, notices };
}

type PostReplaceInput = {
  at: string;
  resistance: number;
  runHours: number;
  status: EquipmentStatus;
  note?: string;
  reason?: string;
};

function appendPostReplaceReading(
  prev: AppState,
  woId: string,
  kind: Extract<ReadingKind, "retest" | "amend">,
  input: PostReplaceInput
): Outcome {
  const wo = prev.workOrders.find((w) => w.id === woId);
  if (!wo) return err("工单不存在", prev);
  if (wo.status !== "待复测") return err(`${woId} 当前为「${wo.status}」，不能登记复测/补录`, prev);
  if (wo.lockedResistance == null) return err("缺少锁定读数，无法比对复测结果", prev);
  if (!Number.isFinite(input.resistance) || input.resistance < 0)
    return err("复测初阻力需为不小于 0 的数值", prev);
  if (!Number.isFinite(input.runHours) || input.runHours < 0)
    return err("运行时长需为不小于 0 的数值", prev);
  if (!input.at) return err("请选择日期", prev);
  if (kind === "amend" && !input.reason?.trim())
    return err("补录必须填写原因，且原读数将原样保留", prev);

  const state = cloneState(prev);
  const reading: Reading = {
    id: nextReadingId(state),
    kind,
    filterId: wo.filterId,
    roomId: wo.roomId,
    at: input.at,
    resistance: input.resistance,
    runHours: input.runHours,
    status: input.status,
    note: input.note?.trim() || undefined,
    reason: kind === "amend" ? input.reason!.trim() : undefined,
    workOrderId: wo.id,
  };
  state.seq.reading += 1;
  state.readings.push(reading);

  const target = state.workOrders.find((w) => w.id === woId)!;
  target.retestReadingId = reading.id;
  target.retestResistance = reading.resistance;

  const dropped = reading.resistance < wo.lockedResistance;
  const notices: Notice[] = [
    {
      kind: dropped ? "ok" : "warn",
      text:
        kind === "amend"
          ? `补录 ${reading.resistance} Pa 已带原因留存，旧值 ${wo.lockedResistance} Pa 保留不覆盖`
          : `复测 ${reading.resistance} Pa，锁定值 ${wo.lockedResistance} Pa`,
    },
  ];
  if (!dropped) {
    notices.push({ kind: "err", text: "复测未下降，工单不得关闭；请重新处理后再次复测或补录（带原因）" });
  } else {
    notices.push({ kind: "ok", text: "复测已下降，可关闭工单" });
  }
  return { state, notices };
}

export function submitRetest(prev: AppState, woId: string, input: PostReplaceInput): Outcome {
  return appendPostReplaceReading(prev, woId, "retest", input);
}

export function submitAmend(prev: AppState, woId: string, input: PostReplaceInput): Outcome {
  return appendPostReplaceReading(prev, woId, "amend", input);
}

/** 关闭：仅当存在低于锁定值的复测/补录读数 */
export function closeWorkOrder(prev: AppState, woId: string, note: string): Outcome {
  const wo = prev.workOrders.find((w) => w.id === woId);
  if (!wo) return err("工单不存在", prev);
  if (wo.status !== "待复测") return err(`${woId} 当前为「${wo.status}」，不能关闭`, prev);
  const qualifying = closingReading(prev, wo);
  if (!qualifying)
    return err(`复测未下降（锁定 ${wo.lockedResistance ?? "-"} Pa），工单不得关闭`, prev);

  const state = cloneState(prev);
  const target = state.workOrders.find((w) => w.id === woId)!;
  target.status = "已关闭";
  target.closedAt = BUSINESS_DATE;
  target.closeNote = note.trim() || undefined;
  return {
    state,
    notices: [
      {
        kind: "ok",
        text: `${woId} 已关闭：复测 ${qualifying.resistance} Pa < 锁定 ${wo.lockedResistance} Pa，批次 ${wo.newBatchId} 装机生效`,
      },
    ],
  };
}

// ---------- 一致性校验（刷新后趋势 / 工单 / 批次关系必须一致） ----------

export function consistencyIssues(state: AppState): string[] {
  const issues: string[] = [];

  // 1. 同一过滤器至多一张未关闭工单
  const openByFilter = new Map<string, number>();
  for (const wo of state.workOrders) {
    if (wo.status !== "已关闭") openByFilter.set(wo.filterId, (openByFilter.get(wo.filterId) ?? 0) + 1);
  }
  for (const [filterId, count] of openByFilter) {
    if (count > 1) issues.push(`过滤器 ${filterId} 存在 ${count} 张未关闭工单`);
  }

  // 2. 批次占用数 = 装机过滤器数；库存/占用/报废非负
  for (const batch of state.batches) {
    const installed = filtersOnBatch(state, batch.id).length;
    if (installed !== batch.occupied)
      issues.push(`批次 ${batch.id} 占用数 ${batch.occupied} 与装机过滤器数 ${installed} 不一致`);
    if (batch.stock < 0 || batch.occupied < 0 || batch.scrapped < 0)
      issues.push(`批次 ${batch.id} 库存/占用/报废出现负数`);
  }

  // 3. 引用完整性
  for (const f of state.filters) {
    if (!state.rooms.some((r) => r.id === f.roomId)) issues.push(`过滤器 ${f.id} 引用了不存在的房间`);
    if (f.installedBatchId && !state.batches.some((b) => b.id === f.installedBatchId))
      issues.push(`过滤器 ${f.id} 引用了不存在的批次 ${f.installedBatchId}`);
  }
  const readingIds = new Set(state.readings.map((r) => r.id));
  for (const wo of state.workOrders) {
    if (!state.filters.some((f) => f.id === wo.filterId)) issues.push(`${wo.id} 引用了不存在的过滤器`);
    for (const rid of [wo.lockedReadingId, wo.retestReadingId]) {
      if (rid && !readingIds.has(rid)) issues.push(`${wo.id} 引用了不存在的读数 ${rid}`);
    }
    for (const bid of [wo.oldBatchId, wo.newBatchId]) {
      if (bid && !state.batches.some((b) => b.id === bid)) issues.push(`${wo.id} 引用了不存在的批次 ${bid}`);
    }
  }

  // 4. 已关闭工单必须有低于锁定值的复测/补录
  for (const wo of state.workOrders) {
    if (wo.status === "已关闭") {
      if (wo.lockedResistance == null || wo.retestResistance == null)
        issues.push(`${wo.id} 已关闭但缺少锁定或复测读数`);
      else if (wo.retestResistance >= wo.lockedResistance)
        issues.push(`${wo.id} 已关闭但复测 ${wo.retestResistance} 未低于锁定 ${wo.lockedResistance}`);
      if (!wo.newBatchId) issues.push(`${wo.id} 已关闭但未记录更换批次`);
    }
    if (wo.status === "待复测" && wo.lockedReadingId == null)
      issues.push(`${wo.id} 处于待复测但缺少锁定读数`);
  }

  return issues;
}
