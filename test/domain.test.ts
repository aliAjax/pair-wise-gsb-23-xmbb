import assert from "node:assert";
import {
  amendInspection,
  batchRemaining,
  closeAfterRetest,
  completeReplacement,
  dispatchOrder,
  isBatchUsable,
  isReadingLocked,
  lockReading,
  openOrderOf,
  registerInspection,
  trendOf,
  DomainError,
} from "../src/domain";
import { AppState } from "../src/types";

let state: AppState = {
  rooms: [
    { id: "R1", isoClass: "ISO 5", dpLimit: 100 },
    { id: "R2", isoClass: "ISO 6", dpLimit: 200 },
  ],
  filters: [
    { id: "F1", roomId: "R1", spec: "H14", installBatchId: "B-OLD" },
    { id: "F2", roomId: "R2", spec: "H13", installBatchId: null },
  ],
  batches: [
    { id: "B-OLD", spec: "H14", totalQty: 1, inboundAt: "2025-01-01", expiry: "2020-01-01" },
    { id: "B-NEW", spec: "H14", totalQty: 1, inboundAt: "2026-01-01", expiry: "2099-01-01" },
    { id: "B-EMPTY", spec: "H14", totalQty: 0, inboundAt: "2026-01-01", expiry: "2099-01-01" },
    { id: "B-OTHER", spec: "H13", totalQty: 5, inboundAt: "2026-01-01", expiry: "2099-01-01" },
  ],
  inspections: [],
  orders: [],
};

const mustFail = (msgRe: RegExp, fn: () => void) => {
  try {
    fn();
    assert.fail(`应当抛出异常: ${msgRe}`);
  } catch (e) {
    assert.ok(e instanceof DomainError && msgRe.test(e.message), `错误信息不符: ${(e as Error).message}`);
  }
};

// 1. 连续两次上升不建单，第三次严格递增 -> 自动建单（待派工）
state = registerInspection(state, { filterId: "F1", reading: 60, runningHours: 100, equipmentStatus: "正常运行", note: "", inspector: "巡检员" });
state = registerInspection(state, { filterId: "F1", reading: 70, runningHours: 120, equipmentStatus: "正常运行", note: "", inspector: "巡检员" });
assert.equal(state.orders.length, 0, "两次读数不应建单");
state = registerInspection(state, { filterId: "F1", reading: 80, runningHours: 140, equipmentStatus: "正常运行", note: "", inspector: "巡检员" });
assert.equal(state.orders.length, 1);
assert.equal(state.orders[0].status, "待派工");
assert.equal(state.orders[0].reason, "连续上升");
assert.ok(trendOf(state, "F1").rising);

// 2. 同过滤器后续读数不重复建单
state = registerInspection(state, { filterId: "F1", reading: 120, runningHours: 150, equipmentStatus: "带病运行", note: "", inspector: "巡检员" });
assert.equal(state.orders.length, 1, "未关闭工单存在时不得重复建单");
assert.equal(openOrderOf(state, "F1")!.reason, "连续上升", "原因保持首次触发");

// 3. 派工 -> 锁定；锁定期间禁止登记新巡检读数
const wo = state.orders[0];
state = dispatchOrder(state, wo.id, "赵工", "班组长");
state = lockReading(state, wo.id, "厂务工程师");
assert.equal(openOrderOf(state, "F1")!.status, "更换中");
assert.equal(openOrderOf(state, "F1")!.lockedReading, 120);
assert.ok(isReadingLocked(state, "F1"));
// （UI 层依据 isReadingLocked 拦截登记；领域层同样拒绝）
mustFail(/不接受新巡检/, () =>
  registerInspection(state, { filterId: "F1", reading: 90, runningHours: 145, equipmentStatus: "正常运行", note: "", inspector: "巡检员" }),
);

// 4. 选批次校验：过期 / 规格不符 / 无余量均拒绝；有效批次可更换并释放旧批次
const lockedWo = openOrderOf(state, "F1")!;
mustFail(/有效期/, () => completeReplacement(state, lockedWo.id, "B-OLD", "厂务工程师"));
mustFail(/规格不符/, () => completeReplacement(state, lockedWo.id, "B-OTHER", "厂务工程师"));
mustFail(/余量不足/, () => completeReplacement(state, lockedWo.id, "B-EMPTY", "厂务工程师"));

const oldBatch = state.batches.find((b) => b.id === "B-OLD")!;
assert.equal(batchRemaining(oldBatch, state.filters), 0, "旧批次初始被 F1 占用，余量 0");
state = completeReplacement(state, lockedWo.id, "B-NEW", "厂务工程师");
const f1 = state.filters.find((f) => f.id === "F1")!;
assert.equal(f1.installBatchId, "B-NEW", "新批次被占用");
assert.equal(batchRemaining(state.batches.find((b) => b.id === "B-OLD")!, state.filters), 1, "旧批次释放，余量恢复");
assert.equal(batchRemaining(state.batches.find((b) => b.id === "B-NEW")!, state.filters), 0, "新批次占用后余量 0");
const wo2 = openOrderOf(state, "F1")!;
assert.equal(wo2.status, "待复测");
assert.equal(wo2.oldBatchId, "B-OLD");
assert.ok(isBatchUsable(state.batches.find((b) => b.id === "B-NEW")!));

// 5. 复测未下降 -> 不得关闭
state = registerInspection(state, { filterId: "F1", reading: 125, runningHours: 160, equipmentStatus: "带病运行", note: "换完还是高", inspector: "巡检员" });
const badRetest = state.inspections.at(-1)!;
let r = closeAfterRetest(state, wo2.id, badRetest.id, "厂务工程师");
assert.equal(r.result.pass, false);
state = r.state;
assert.equal(openOrderOf(state, "F1")!.status, "待复测", "复测未下降必须保持待复测");

// 6. 复测下降且不超上限 -> 关闭
state = registerInspection(state, { filterId: "F1", reading: 55, runningHours: 165, equipmentStatus: "正常运行", note: "复测正常", inspector: "巡检员" });
const goodRetest = state.inspections.at(-1)!;
r = closeAfterRetest(state, wo2.id, goodRetest.id, "厂务工程师");
assert.equal(r.result.pass, true, r.result.message);
state = r.state;
assert.equal(openOrderOf(state, "F1"), undefined, "关闭后无未关闭工单");
assert.equal(state.orders.find((o) => o.id === wo2.id)!.status, "已关闭");

// 7. 关闭后再次超限可重新建单
state = registerInspection(state, { filterId: "F1", reading: 130, runningHours: 200, equipmentStatus: "带病运行", note: "", inspector: "巡检员" });
assert.equal(state.orders.filter((o) => o.filterId === "F1" && o.status === "待派工").length, 1, "关闭后允许再建新单");

// 8. 补录：必须带原因，旧值保留为 Revision
const target = state.inspections.find((i) => i.reading === 60)!;
mustFail(/原因/, () => amendInspection(state, target.id, { reading: 62 }, "", "厂务工程师"));
state = amendInspection(state, target.id, { reading: 62, equipmentStatus: "带病运行" }, "仪表校准偏差", "厂务工程师");
const amended = state.inspections.find((i) => i.id === target.id)!;
assert.equal(amended.reading, 62);
assert.equal(amended.revisions.length, 2);
assert.equal(amended.revisions[0].field, "reading");
assert.equal(amended.revisions[0].oldValue, "60");
assert.equal(amended.revisions[0].newValue, "62");
assert.equal(amended.revisions[0].reason, "仪表校准偏差");

// 9. 工单锁定的基准读数不可补录
const lockInspId = state.orders.find((o) => o.id === wo2.id)!.lockedInspectionId!;
mustFail(/锁定/, () =>
  amendInspection(state, lockInspId, { reading: 999 }, "强改", "厂务工程师"),
);

// 10. 超上限立即建单（F2 上限 200）
state = registerInspection(state, { filterId: "F2", reading: 201, runningHours: 10, equipmentStatus: "带病运行", note: "", inspector: "巡检员" });
const f2orders = state.orders.filter((o) => o.filterId === "F2");
assert.equal(f2orders.length, 1);
assert.equal(f2orders[0].reason, "超过上限");

// 11. JSON 序列化往返（模拟刷新）保持一致
const restored: AppState = JSON.parse(JSON.stringify(state));
assert.deepEqual(restored, state);
assert.equal(restored.orders.length, state.orders.length);

console.log("全部领域用例通过 ✓");
