import {
  AppState,
  Batch,
  EquipmentStatus,
  Filter,
  Inspection,
  OPEN_STATUSES,
  OrderEvent,
  OrderReason,
  Revision,
  RevisionField,
  Role,
  Room,
  WorkOrder,
} from "./types";

// ---------- 工具 ----------

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isBatchUsable(batch: Batch, at: Date = new Date()): boolean {
  return batch.expiry >= at.toISOString().slice(0, 10);
}

/** 批次可用余量 = 总量 - 已在用过滤器数（批次有效期内可继续领用） */
export function batchRemaining(batch: Batch, filters: Filter[]): number {
  const used = filters.filter((f) => f.installBatchId === batch.id).length;
  return batch.totalQty - used;
}

export function roomOf(state: AppState, roomId: string): Room | undefined {
  return state.rooms.find((r) => r.id === roomId);
}

export function filterOf(state: AppState, filterId: string): Filter | undefined {
  return state.filters.find((f) => f.id === filterId);
}

export function openOrderOf(state: AppState, filterId: string): WorkOrder | undefined {
  return state.orders.find((o) => o.filterId === filterId && OPEN_STATUSES.includes(o.status));
}

export function isOrderOpen(order: WorkOrder): boolean {
  return OPEN_STATUSES.includes(order.status);
}

// ---------- 趋势判定 ----------

export interface ReadingPoint {
  inspectionId: string;
  createdAt: string;
  reading: number;
}

/** 取某过滤器按时间正序排列的压差序列（以补录后的当前值为准） */
export function readingSeries(state: AppState, filterId: string): ReadingPoint[] {
  return state.inspections
    .filter((i) => i.filterId === filterId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((i) => ({ inspectionId: i.id, createdAt: i.createdAt, reading: i.reading }));
}

/**
 * 连续上升：最近 RISE_MIN_POINTS 次巡检读数严格递增。
 * 若期间已经存在未关闭工单，则不再重复判定。
 */
export const RISE_MIN_POINTS = 3;

export function isContinuouslyRising(series: ReadingPoint[]): boolean {
  if (series.length < RISE_MIN_POINTS) return false;
  const tail = series.slice(-RISE_MIN_POINTS);
  return tail.every((p, idx) => idx === 0 || p.reading > tail[idx - 1].reading);
}

export function isOverLimit(state: AppState, filterId: string, reading: number): boolean {
  const filter = filterOf(state, filterId);
  if (!filter) return false;
  const room = roomOf(state, filter.roomId);
  if (!room) return false;
  return reading > room.dpLimit;
}

export interface TrendInfo {
  series: ReadingPoint[];
  rising: boolean;
  overLimit: boolean;
  limit: number | null;
  latest: number | null;
}

export function trendOf(state: AppState, filterId: string): TrendInfo {
  const filter = filterOf(state, filterId);
  const room = filter ? roomOf(state, filter.roomId) : undefined;
  const series = readingSeries(state, filterId);
  const latest = series.length ? series[series.length - 1].reading : null;
  return {
    series,
    rising: isContinuouslyRising(series),
    overLimit: latest !== null && room ? latest > room.dpLimit : false,
    limit: room ? room.dpLimit : null,
    latest,
  };
}

// ---------- 错误 ----------

export class DomainError extends Error {}

function fail(message: string): never {
  throw new DomainError(message);
}

function event(type: string, detail: string, by: Role | "系统" = "系统"): OrderEvent {
  return { at: nowIso(), by, type, detail };
}

// ---------- 动作：巡检登记 ----------

export interface InspectionInput {
  filterId: string;
  reading: number;
  runningHours: number;
  equipmentStatus: EquipmentStatus;
  note: string;
  inspector: Role;
  createdAt?: string; // 可选：补录历史时间
}

/**
 * 登记一次巡检。
 * - 读数超区域上限、或最近三次连续上升时自动生成「待派工」工单；
 * - 同一过滤器存在未关闭工单时不重复建单（避免重复派工）。
 */
export function registerInspection(state: AppState, input: InspectionInput): AppState {
  const filter = filterOf(state, input.filterId) ?? fail("过滤器不存在");
  if (!Number.isFinite(input.reading) || input.reading < 0) fail("初阻力/压差读数不合法");
  if (!Number.isFinite(input.runningHours) || input.runningHours < 0) fail("运行时长不合法");

  // 更换中：读数已被锁定，直到完成更换（进入待复测）才能登记复测读数
  const locking = openOrderOf(state, input.filterId);
  if (locking && locking.status === "更换中" && locking.lockedInspectionId !== null) {
    fail(`读数已被工单 ${locking.id} 锁定，更换完成前不接受新巡检`);
  }

  const inspection: Inspection = {
    id: uid("INSP"),
    filterId: input.filterId,
    roomId: filter.roomId,
    reading: input.reading,
    runningHours: input.runningHours,
    equipmentStatus: input.equipmentStatus,
    note: input.note.trim(),
    inspector: input.inspector,
    createdAt: input.createdAt ?? nowIso(),
    revisions: [],
  };

  const inspections = [...state.inspections, inspection];
  const next: AppState = { ...state, inspections };

  const existing = openOrderOf(next, input.filterId);
  if (existing) {
    // 复测读数登记在待复测工单上（由 completeReplacement 建立关联，这里不自动关闭）
    return next;
  }

  const series = readingSeries(next, input.filterId);
  const room = roomOf(next, filter.roomId)!;
  const overLimit = input.reading > room.dpLimit;
  const rising = isContinuouslyRising(series);

  if (!overLimit && !rising) return next;

  const reason: OrderReason = overLimit ? "超过上限" : "连续上升";
  const order = createOrder(state, filter, reason, input.inspector, inspection, overLimit, rising);
  return { ...next, orders: [...next.orders, order] };
}

function createOrder(
  state: AppState,
  filter: Filter,
  reason: OrderReason,
  createdBy: Role,
  trigger: Inspection,
  overLimit: boolean,
  rising: boolean,
): WorkOrder {
  const room = roomOf(state, filter.roomId);
  const detailParts: string[] = [];
  if (overLimit) detailParts.push(`读数 ${trigger.reading}Pa 超过区域上限 ${room?.dpLimit ?? "?"}Pa`);
  if (rising) detailParts.push(`最近 ${RISE_MIN_POINTS} 次读数连续上升`);
  return {
    id: uid("WO"),
    filterId: filter.id,
    roomId: filter.roomId,
    reason,
    status: "待派工",
    assignee: null,
    lockedReading: null,
    lockedRunningHours: null,
    lockedInspectionId: null,
    oldBatchId: null,
    newBatchId: null,
    retestInspectionId: null,
    createdAt: nowIso(),
    createdBy,
    events: [event("自动建单", `${detailParts.join("；")}（触发巡检 ${trigger.id}）`)],
  };
}

/** 班组长/工程师手工建工单（同样受“一过滤器一未关闭工单”约束） */
export function createManualOrder(
  state: AppState,
  filterId: string,
  reason: string,
  createdBy: Role,
): AppState {
  const filter = filterOf(state, filterId) ?? fail("过滤器不存在");
  if (openOrderOf(state, filterId)) fail("该过滤器已有未关闭工单，不能重复建单");
  const fakeTrigger: Inspection = {
    id: "-",
    filterId,
    roomId: filter.roomId,
    reading: NaN,
    runningHours: NaN,
    equipmentStatus: "正常运行",
    note: reason,
    inspector: createdBy,
    createdAt: nowIso(),
    revisions: [],
  };
  const order = createOrder(state, filter, "手工", createdBy, fakeTrigger, false, false);
  order.events = [event("手工建单", reason || "厂务工程师手工发起更换", createdBy)];
  return { ...state, orders: [...state.orders, order] };
}

// ---------- 动作：派工 ----------

export function dispatchOrder(state: AppState, orderId: string, assignee: string, by: Role): AppState {
  const order = state.orders.find((o) => o.id === orderId) ?? fail("工单不存在");
  if (order.status !== "待派工") fail("仅待派工工单可以派工");
  const name = assignee.trim() || fail("必须填写执行人");
  const updated: WorkOrder = {
    ...order,
    status: "已派工",
    assignee: name,
    events: [...order.events, event("派工", `派发给 ${name}`, by)],
  };
  return { ...state, orders: replace(state.orders, updated) };
}

// ---------- 动作：更换前锁定读数 ----------

/**
 * 进入更换：以最近一次巡检为基准锁定读数与运行时长。
 * 锁定后该过滤器的巡检读数被冻结，直到更换完成（复测走新巡检）。
 */
export function lockReading(state: AppState, orderId: string, by: Role): AppState {
  const order = state.orders.find((o) => o.id === orderId) ?? fail("工单不存在");
  if (order.status !== "已派工") fail("仅已派工工单可以锁定读数并开始更换");

  const latest = readingSeries(state, order.filterId).slice(-1)[0];
  if (!latest) fail("该过滤器尚无巡检记录，无法锁定读数");

  const insp = state.inspections.find((i) => i.id === latest.inspectionId)!;
  const updated: WorkOrder = {
    ...order,
    status: "更换中",
    lockedReading: latest.reading,
    lockedRunningHours: insp.runningHours,
    lockedInspectionId: latest.inspectionId,
    events: [
      ...order.events,
      event(
        "锁定读数",
        `锁定读数 ${latest.reading}Pa / 运行 ${insp.runningHours}h（巡检 ${latest.inspectionId}）`,
        by,
      ),
    ],
  };
  return { ...state, orders: replace(state.orders, updated) };
}

export function isReadingLocked(state: AppState, filterId: string): boolean {
  const order = openOrderOf(state, filterId);
  return !!order && order.status === "更换中" && order.lockedInspectionId !== null;
}

// ---------- 动作：备件批次校验 ----------

export function assertBatchSelectable(state: AppState, batchId: string, filter: Filter): Batch {
  const batch = state.batches.find((b) => b.id === batchId) ?? fail("备件批次不存在");
  if (batch.spec !== filter.spec) fail(`备件规格不符：需要 ${filter.spec}，批次为 ${batch.spec}`);
  if (!isBatchUsable(batch)) fail(`批次 ${batch.id} 已过有效期（${batch.expiry}）`);
  const remaining = batchRemaining(batch, state.filters);
  if (remaining <= 0) fail(`批次 ${batch.id} 余量不足`);
  return batch;
}

// ---------- 动作：完成更换（释放旧批次、占用新批次） ----------

/**
 * 完成更换：
 * 1. 必须已锁定读数；
 * 2. 必须选用有效期内、规格匹配且有余量的备件批次；
 * 3. 释放旧批次占用（filter.installBatchId 置空旧引用），占用新批次；
 * 4. 工单进入「待复测」，复测未通过不得关闭。
 */
export function completeReplacement(
  state: AppState,
  orderId: string,
  newBatchId: string,
  by: Role,
): AppState {
  const order = state.orders.find((o) => o.id === orderId) ?? fail("工单不存在");
  if (order.status !== "更换中" || order.lockedReading === null) fail("请先锁定读数再完成更换");
  const filter = filterOf(state, order.filterId) ?? fail("过滤器不存在");

  const batch = assertBatchSelectable(state, newBatchId, filter);
  if (filter.installBatchId === batch.id) fail("新批次与当前在用批次相同，无需更换");

  const oldBatchId = filter.installBatchId;
  const updatedFilter: Filter = { ...filter, installBatchId: batch.id };
  const updatedOrder: WorkOrder = {
    ...order,
    oldBatchId,
    newBatchId: batch.id,
    status: "待复测",
    events: [
      ...order.events,
      event(
        "完成更换",
        `释放旧批次 ${oldBatchId ?? "无"}，占用新批次 ${batch.id}（有效期至 ${batch.expiry}），等待复测`,
        by,
      ),
    ],
  };

  return {
    ...state,
    filters: replace(state.filters, updatedFilter),
    orders: replace(state.orders, updatedOrder),
  };
}

// ---------- 动作：复测与关闭 ----------

export interface RetestResult {
  pass: boolean;
  retestInspectionId: string;
  reading: number;
  message: string;
}

/** 判定复测结果：更换后新读数必须较锁定读数下降，且不高于区域上限 */
export function evaluateRetest(
  state: AppState,
  order: WorkOrder,
  retestInspectionId: string,
): RetestResult {
  const retest = state.inspections.find((i) => i.id === retestInspectionId);
  if (!retest) return { pass: false, retestInspectionId, reading: NaN, message: "复测记录不存在" };
  const room = roomOf(state, order.roomId);
  const locked = order.lockedReading;
  if (locked === null) return { pass: false, retestInspectionId, reading: retest.reading, message: "缺少锁定读数" };
  const dropped = retest.reading < locked;
  const withinLimit = room ? retest.reading <= room.dpLimit : true;
  const reasons: string[] = [];
  if (!dropped) reasons.push(`复测 ${retest.reading}Pa 未较锁定值 ${locked}Pa 下降`);
  if (!withinLimit) reasons.push(`复测 ${retest.reading}Pa 仍高于区域上限 ${room?.dpLimit}Pa`);
  return {
    pass: dropped && withinLimit,
    retestInspectionId,
    reading: retest.reading,
    message: reasons.length ? reasons.join("；") : `复测 ${retest.reading}Pa 低于锁定值且在限值内`,
  };
}

/**
 * 登记复测巡检后关闭工单。
 * 复测未下降（或仍超上限）不得关闭，工单保持「待复测」。
 */
export function closeAfterRetest(
  state: AppState,
  orderId: string,
  retestInspectionId: string,
  by: Role,
): { state: AppState; result: RetestResult } {
  const order = state.orders.find((o) => o.id === orderId) ?? fail("工单不存在");
  if (order.status !== "待复测") fail("仅待复测工单可以执行复测关闭");

  const result = evaluateRetest(state, order, retestInspectionId);
  if (!result.pass) {
    const blocked: WorkOrder = {
      ...order,
      events: [...order.events, event("复测拦截", result.message + "，工单保持待复测", by)],
    };
    return { state: { ...state, orders: replace(state.orders, blocked) }, result };
  }

  const closed: WorkOrder = {
    ...order,
    status: "已关闭",
    retestInspectionId,
    events: [...order.events, event("复测通过关闭", result.message, by)],
  };
  return { state: { ...state, orders: replace(state.orders, closed) }, result };
}

export function cancelOrder(state: AppState, orderId: string, by: Role, reason: string): AppState {
  const order = state.orders.find((o) => o.id === orderId) ?? fail("工单不存在");
  if (!isOrderOpen(order)) fail("工单已关闭，不能取消");
  // 更换中若已占用新批次，取消流程不在此处理退料；只允许在未完成更换前取消
  if (order.status === "待复测") fail("已完成更换，请走复测流程，不能取消");
  const updated: WorkOrder = {
    ...order,
    status: "已取消",
    events: [...order.events, event("取消", reason.trim() || "无", by)],
  };
  return { ...state, orders: replace(state.orders, updated) };
}

// ---------- 动作：补录（带原因，保留旧值） ----------

/**
 * 补录巡检：只允许修正读数/运行时长/设备状态，必须填写原因。
 * 旧值不被覆盖，以 Revision 追加留痕；当前展示值更新为新值。
 * 若该巡检是某未关闭工单的锁定依据，则不允许修改读数（锁定不可变）。
 */
export function amendInspection(
  state: AppState,
  inspectionId: string,
  patch: Partial<Pick<Inspection, "reading" | "runningHours" | "equipmentStatus">>,
  reason: string,
  by: Role,
): AppState {
  const inspection = state.inspections.find((i) => i.id === inspectionId) ?? fail("巡检记录不存在");
  if (!reason.trim()) fail("补录必须填写原因");

  // 任何已产生过锁定的工单（含已关闭），其基准读数都是处置证据，永久不可补录
  const lockingOrder = state.orders.find((o) => o.lockedInspectionId === inspectionId);
  if (lockingOrder && patch.reading !== undefined && patch.reading !== inspection.reading) {
    fail("该读数已被更换工单锁定，不能修改；如需更正请新建巡检记录");
  }

  const revisions: Revision[] = [];
  (["reading", "runningHours", "equipmentStatus"] as RevisionField[]).forEach((field) => {
    const next = patch[field];
    if (next === undefined) return;
    const oldVal = String(inspection[field]);
    if (String(next) === oldVal) return;
    revisions.push({
      field,
      oldValue: oldVal,
      newValue: String(next),
      reason: reason.trim(),
      revisedAt: nowIso(),
      revisedBy: by,
    });
  });
  if (revisions.length === 0) fail("没有需要补录的变更");

  const updated: Inspection = {
    ...inspection,
    reading: patch.reading ?? inspection.reading,
    runningHours: patch.runningHours ?? inspection.runningHours,
    equipmentStatus: patch.equipmentStatus ?? inspection.equipmentStatus,
    revisions: [...inspection.revisions, ...revisions],
  };
  return { ...state, inspections: replace(state.inspections, updated) };
}

// ---------- 工具 ----------

function replace<T extends { id: string }>(list: T[], item: T): T[] {
  return list.map((x) => (x.id === item.id ? item : x));
}
