import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppState, Notice } from "./domain";
import { consistencyIssues } from "./domain";
import { createSeedState } from "./seed";

const STORAGE_KEY = "hxwl-09.cleanroom.state.v1";

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.readings) && Array.isArray(parsed.workOrders)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回退到种子数据
  }
  return createSeedState();
}

export function useStore() {
  const [state, setState] = useState<AppState>(loadState);
  const [notices, setNotices] = useState<Notice[]>([]);

  // 刷新/每次变更后趋势、工单和批次关系必须一致：保存并校验
  const issues = useMemo(() => consistencyIssues(state), [state]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 隐私模式等场景忽略持久化失败
    }
  }, [state]);

  // 操作统一入口：纯函数返回新状态与提示
  const apply = useCallback((outcome: { state: AppState; notices: Notice[] }) => {
    setState(outcome.state);
    setNotices(outcome.notices);
    const fresh = consistencyIssues(outcome.state);
    if (fresh.length > 0) {
      setNotices((prev) => [
        ...prev,
        { kind: "err", text: `一致性校验异常：${fresh.join("；")}` },
      ]);
    }
  }, []);

  const resetDemo = useCallback(() => {
    const seed = createSeedState();
    setState(seed);
    setNotices([{ kind: "ok", text: "已恢复演示数据，刷新页面后状态保持一致" }]);
  }, []);

  const clearNotices = useCallback(() => setNotices([]), []);

  return { state, setState, notices, apply, resetDemo, clearNotices, issues };
}
