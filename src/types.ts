// 洁净室过滤器压差闭环领域模型

export type Role = "巡检员" | "厂务工程师" | "班组长";

export const ROLES: Role[] = ["巡检员", "厂务工程师", "班组长"];

export type EquipmentStatus = "正常运行" | "带病运行" | "停机";

export const EQUIPMENT_STATUSES: EquipmentStatus[] = ["正常运行", "带病运行", "停机"];

export type FilterSpec = "H13" | "H14";

export interface Room {
  id: string; // 房间编号
  isoClass: string; // 洁净等级
  dpLimit: number; // 该区域压差上限 Pa
}

export interface Filter {
  id: string; // 过滤器编号
  roomId: string;
  spec: FilterSpec;
  installBatchId: string | null; // 当前在用备件批次
}

export type RevisionField = "reading" | "runningHours" | "equipmentStatus";

export interface Revision {
  field: RevisionField;
  oldValue: string;
  newValue: string;
  reason: string;
  revisedAt: string;
  revisedBy: Role;
}

export interface Inspection {
  id: string;
  filterId: string;
  roomId: string;
  reading: number; // 初阻力 / 实测压差 Pa
  runningHours: number; // 累计运行时长 h
  equipmentStatus: EquipmentStatus;
  note: string;
  inspector: Role;
  createdAt: string;
  revisions: Revision[]; // 补录留痕：旧值保留，只允许带原因追加
}

export interface Batch {
  id: string;
  spec: FilterSpec;
  totalQty: number;
  inboundAt: string;
  expiry: string; // 有效期至（ISO date）
}

export type OrderStatus = "待派工" | "已派工" | "更换中" | "待复测" | "已关闭" | "已取消";

export const OPEN_STATUSES: OrderStatus[] = ["待派工", "已派工", "更换中", "待复测"];

export type OrderReason = "连续上升" | "超过上限" | "手工";

export interface OrderEvent {
  at: string;
  by: Role | "系统";
  type: string;
  detail: string;
}

export interface WorkOrder {
  id: string;
  filterId: string;
  roomId: string;
  reason: OrderReason;
  status: OrderStatus;
  assignee: string | null;
  lockedReading: number | null; // 更换前锁定读数
  lockedRunningHours: number | null;
  lockedInspectionId: string | null;
  oldBatchId: string | null;
  newBatchId: string | null;
  retestInspectionId: string | null;
  createdAt: string;
  createdBy: Role;
  events: OrderEvent[];
}

export interface AppState {
  rooms: Room[];
  filters: Filter[];
  batches: Batch[];
  inspections: Inspection[];
  orders: WorkOrder[];
}
