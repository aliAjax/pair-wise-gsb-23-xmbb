import type { AppState } from "./domain";

// 种子数据：展示完整闭环所需的各种状态
// - F-1002：最近 3 次连续上升（450→470→490，上限 500）→ 待派工单
// - F-0805：超过区域上限（415 > 400）→ 待派工单
// - F-2007：已派工、读数已锁定，等待选用批次执行更换（旧批次 B-2508Q 已过期）
// - F-3002：历史已关闭工单，复测下降，批次占用已切换
export function createSeedState(): AppState {
  return {
    rooms: [
      { id: "CR-1201", name: "光刻送风干区", isoClass: "ISO 5", dpLimit: 500 },
      { id: "CR-1208", name: "刻蚀回风区", isoClass: "ISO 5", dpLimit: 450 },
      { id: "CR-2107", name: "薄膜封装区", isoClass: "ISO 6", dpLimit: 400 },
      { id: "Y-0302", name: "黄光涂胶区", isoClass: "黄光区", dpLimit: 420 },
    ],
    filters: [
      { id: "F-1002", roomId: "CR-1201", spec: "H14", installedBatchId: "B-2601A", installedAt: "2025-11-12" },
      { id: "F-0805", roomId: "CR-2107", spec: "H14", installedBatchId: "B-2603C", installedAt: "2025-08-03" },
      { id: "F-2007", roomId: "CR-1208", spec: "U17", installedBatchId: "B-2508Q", installedAt: "2025-07-20" },
      { id: "F-3002", roomId: "Y-0302", spec: "H14", installedBatchId: "B-2604D", installedAt: "2026-06-18" },
    ],
    batches: [
      // H14
      { id: "B-2601A", spec: "H14", expiry: "2027-03-31", stock: 5, occupied: 1, scrapped: 0 },
      { id: "B-2603C", spec: "H14", expiry: "2026-10-25", stock: 2, occupied: 1, scrapped: 0 }, // 临期
      { id: "B-2604D", spec: "H14", expiry: "2027-06-30", stock: 7, occupied: 1, scrapped: 0 },
      { id: "B-2511K", spec: "H14", expiry: "2026-08-31", stock: 4, occupied: 0, scrapped: 0 }, // 已过期
      { id: "B-2512M", spec: "H14", expiry: "2027-01-15", stock: 0, occupied: 0, scrapped: 1 }, // 零库存，F-3002 旧批次已拆下报废
      // U17
      { id: "B-2607U", spec: "U17", expiry: "2027-09-30", stock: 3, occupied: 0, scrapped: 0 },
      { id: "B-2508Q", spec: "U17", expiry: "2026-07-15", stock: 2, occupied: 1, scrapped: 0 }, // 已过期，F-2007 仍在装机
    ],
    readings: [
      // F-1002：09-16 起最近 3 次连续上升（380→450→470，上限 500）→ 待派工单
      { id: "RD-0001", kind: "inspection", filterId: "F-1002", roomId: "CR-1201", at: "2026-08-22", resistance: 420, runHours: 4100, status: "正常" },
      { id: "RD-0002", kind: "inspection", filterId: "F-1002", roomId: "CR-1201", at: "2026-09-01", resistance: 380, runHours: 4320, status: "正常" },
      { id: "RD-0003", kind: "inspection", filterId: "F-1002", roomId: "CR-1201", at: "2026-09-10", resistance: 450, runHours: 4500, status: "关注" },
      { id: "RD-0004", kind: "inspection", filterId: "F-1002", roomId: "CR-1201", at: "2026-09-16", resistance: 470, runHours: 4650, status: "关注", note: "连续三次上升，已生成工单", workOrderId: "WO-2026-003" },
      { id: "RD-0005", kind: "inspection", filterId: "F-1002", roomId: "CR-1201", at: "2026-09-20", resistance: 490, runHours: 4740, status: "异常", note: "未关闭工单期间继续巡检，不重复派单", workOrderId: "WO-2026-003" },

      // F-0805：超限
      { id: "RD-0006", kind: "inspection", filterId: "F-0805", roomId: "CR-2107", at: "2026-08-20", resistance: 310, runHours: 5200, status: "正常" },
      { id: "RD-0007", kind: "inspection", filterId: "F-0805", roomId: "CR-2107", at: "2026-09-05", resistance: 360, runHours: 5560, status: "关注" },
      { id: "RD-0008", kind: "inspection", filterId: "F-0805", roomId: "CR-2107", at: "2026-09-21", resistance: 415, runHours: 5900, status: "异常", note: "超区域上限，立即处理", workOrderId: "WO-2026-004" },

      // F-2007：已派工、已锁定读数（旧批次过期），待更换
      { id: "RD-0009", kind: "inspection", filterId: "F-2007", roomId: "CR-1208", at: "2026-08-25", resistance: 380, runHours: 4800, status: "关注" },
      { id: "RD-0010", kind: "inspection", filterId: "F-2007", roomId: "CR-1208", at: "2026-09-12", resistance: 455, runHours: 5180, status: "异常", note: "超 450Pa 上限", workOrderId: "WO-2026-002" },

      // F-3002：历史闭环案例
      { id: "RD-0011", kind: "inspection", filterId: "F-3002", roomId: "Y-0302", at: "2026-05-20", resistance: 290, runHours: 3300, status: "正常" },
      { id: "RD-0012", kind: "inspection", filterId: "F-3002", roomId: "Y-0302", at: "2026-06-02", resistance: 360, runHours: 3600, status: "关注" },
      { id: "RD-0013", kind: "inspection", filterId: "F-3002", roomId: "Y-0302", at: "2026-06-10", resistance: 430, runHours: 3780, status: "异常", note: "超 420Pa 上限", workOrderId: "WO-2026-001" },
      { id: "RD-0014", kind: "retest", filterId: "F-3002", roomId: "Y-0302", at: "2026-06-18", resistance: 245, runHours: 0, status: "正常", note: "更换 B-2604D 后首次复测", workOrderId: "WO-2026-001" },
      { id: "RD-0015", kind: "inspection", filterId: "F-3002", roomId: "Y-0302", at: "2026-07-15", resistance: 255, runHours: 620, status: "正常" },
      { id: "RD-0016", kind: "inspection", filterId: "F-3002", roomId: "Y-0302", at: "2026-08-18", resistance: 262, runHours: 1400, status: "正常" },
      { id: "RD-0017", kind: "inspection", filterId: "F-3002", roomId: "Y-0302", at: "2026-09-16", resistance: 270, runHours: 2080, status: "正常" },
    ],
    workOrders: [
      {
        id: "WO-2026-001",
        filterId: "F-3002",
        roomId: "Y-0302",
        status: "已关闭",
        trigger: "超过区域上限",
        createdAt: "2026-06-10",
        dispatchedAt: "2026-06-11",
        assignee: "李工",
        lockedReadingId: "RD-0013",
        lockedResistance: 430,
        oldBatchId: "B-2512M",
        newBatchId: "B-2604D",
        replacedAt: "2026-06-18",
        retestReadingId: "RD-0014",
        retestResistance: 245,
        closedAt: "2026-06-18",
        closeNote: "复测下降至初阻力区间，关闭",
      },
      {
        id: "WO-2026-002",
        filterId: "F-2007",
        roomId: "CR-1208",
        status: "已派工",
        trigger: "超过区域上限",
        createdAt: "2026-09-12",
        dispatchedAt: "2026-09-13",
        assignee: "周师傅",
        lockedReadingId: "RD-0010",
        lockedResistance: 455,
      },
      {
        id: "WO-2026-003",
        filterId: "F-1002",
        roomId: "CR-1201",
        status: "待派工",
        trigger: "压差连续上升",
        createdAt: "2026-09-16",
      },
      {
        id: "WO-2026-004",
        filterId: "F-0805",
        roomId: "CR-2107",
        status: "待派工",
        trigger: "超过区域上限",
        createdAt: "2026-09-21",
      },
    ],
    seq: { reading: 18, workOrder: 5 },
  };
}
