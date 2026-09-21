import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ReactNode } from "react";
import {
  amendInspection,
  cancelOrder,
  closeAfterRetest,
  completeReplacement,
  createManualOrder,
  dispatchOrder,
  DomainError,
  lockReading,
  registerInspection,
} from "./domain";
import { seedState } from "./seed";
import {
  AppState,
  EquipmentStatus,
  OPEN_STATUSES,
  Role,
} from "./types";

const STORAGE_KEY = "hxwl-09-cleanroom-state-v1";

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    // 解析失败时回落到种子数据
  }
  return seedState();
}

export interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
}

interface StoreShape {
  state: AppState;
  role: Role;
  setRole: (role: Role) => void;
  toasts: Toast[];
  reset: () => void;
  // 返回 true 表示动作执行成功
  act: (fn: (draft: AppState) => AppState | void, successText: string) => boolean;
  register: (input: {
    filterId: string;
    reading: number;
    runningHours: number;
    equipmentStatus: EquipmentStatus;
    note: string;
    inspector: Role;
  }) => boolean;
  manualOrder: (filterId: string, reason: string) => boolean;
  dispatch: (orderId: string, assignee: string) => boolean;
  lock: (orderId: string) => boolean;
  replace: (orderId: string, batchId: string) => boolean;
  retest: (orderId: string, inspectionId: string) => boolean;
  cancel: (orderId: string, reason: string) => boolean;
  amend: (
    inspectionId: string,
    patch: Partial<{ reading: number; runningHours: number; equipmentStatus: EquipmentStatus }>,
    reason: string,
  ) => boolean;
}

const StoreContext = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadInitial);
  const [role, setRole] = useState<Role>("巡检员");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const commit = useCallback(
    (next: AppState) => {
      setState(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 存储不可用时仅保留内存态
      }
    },
    [],
  );

  const act = useCallback(
    (fn: (draft: AppState) => AppState | void, successText: string): boolean => {
      try {
        const next = fn(state);
        if (next) commit(next);
        pushToast("ok", successText);
        return true;
      } catch (e) {
        const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e);
        pushToast("err", msg);
        return false;
      }
    },
    [state, commit, pushToast],
  );

  const store = useMemo<StoreShape>(
    () => ({
      state,
      role,
      setRole,
      toasts,
      reset: () => {
        const seeded = seedState();
        commit(seeded);
        pushToast("ok", "已重置为演示数据");
      },
      act,
      register: (input) => {
        let auto = false;
        const ok = act((draft) => {
          const before = draft.orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
          const next = registerInspection(draft, input);
          const after = next.orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
          auto = after > before;
          return next;
        }, auto ? "巡检已登记，已自动生成待派工工单" : "巡检已登记");
        return ok;
      },
      manualOrder: (filterId, reason) =>
        act((draft) => createManualOrder(draft, filterId, reason, role), "工单已创建（待派工）"),
      dispatch: (orderId, assignee) =>
        act((draft) => dispatchOrder(draft, orderId, assignee, role), "已派工"),
      lock: (orderId) => act((draft) => lockReading(draft, orderId, role), "读数已锁定，进入更换中"),
      replace: (orderId, batchId) =>
        act((draft) => completeReplacement(draft, orderId, batchId, role), "更换完成，旧批次已释放，进入待复测"),
      retest: (orderId, inspectionId) => {
        let blocked = false;
        let msg = "复测通过，工单已关闭";
        const ok = act((draft) => {
          const r = closeAfterRetest(draft, orderId, inspectionId, role);
          blocked = !r.result.pass;
          if (blocked) msg = r.result.message + "，不得关闭";
          return r.state;
        }, msg);
        if (ok && blocked) {
          // 拦截属于业务提示而非异常：补一条错误样式提示
          pushToast("err", msg);
        }
        return ok && !blocked;
      },
      cancel: (orderId, reason) => act((draft) => cancelOrder(draft, orderId, role, reason), "工单已取消"),
      amend: (inspectionId, patch, reason) =>
        act((draft) => amendInspection(draft, inspectionId, patch, reason, role), "补录完成，旧值已保留留痕"),
    }),
    [state, role, toasts, act, commit, pushToast],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
