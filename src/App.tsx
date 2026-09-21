import { useMemo, useState } from "react";
import "./styles.css";
import type { AppState } from "./domain";
import { dpLevel, openWorkOrders } from "./domain";
import { useStore } from "./store";
import { InspectionTab } from "./components/InspectionTab";
import { TrendTab } from "./components/TrendTab";
import { WorkOrdersTab } from "./components/WorkOrdersTab";
import { BatchesTab } from "./components/BatchesTab";

type TabId = "inspection" | "trend" | "orders" | "batches";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "inspection", label: "巡检登记" },
  { id: "trend", label: "压差趋势" },
  { id: "orders", label: "更换工单" },
  { id: "batches", label: "备件批次" },
];

function computeMetrics(state: AppState) {
  const levels = state.filters.map((f) => dpLevel(state, f.id));
  return [
    { label: "超区域上限", value: levels.filter((l) => l === "overLimit").length, tone: "danger" as const },
    { label: "压差连续上升", value: levels.filter((l) => l === "rising").length, tone: "warn" as const },
    { label: "未关闭工单", value: openWorkOrders(state).length, tone: "warn" as const },
    { label: "在装过滤器", value: state.filters.length, tone: "ok" as const },
  ];
}

const NOTICE_STYLE: Record<string, string> = {
  ok: "notice-ok",
  warn: "notice-warn",
  err: "notice-err",
};

function App() {
  const { state, apply, resetDemo, notices, clearNotices, issues } = useStore();
  const [tab, setTab] = useState<TabId>("inspection");
  const metrics = useMemo(() => computeMetrics(state), [state]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · port 5109</p>
          <h1>半导体洁净室巡检</h1>
          <p className="subtitle">
            过滤器压差趋势监控与更换工单闭环：巡检登记 → 连续上升/超上限自动派单 → 锁定读数 → 有效期内备件领用 → 复测下降关闭
          </p>
        </div>
        <div className="stack-card">
          <span>数据持久化</span>
          <strong>localStorage 自动保存，刷新后趋势、工单与批次占用保持一致</strong>
          <button type="button" onClick={resetDemo} className="reset-btn">
            恢复演示数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.tone === "ok" ? "status-ok" : m.tone === "warn" ? "status-watch" : "status-danger"} />
          </article>
        ))}
      </section>

      {issues.length > 0 && (
        <div className="consistency-banner">
          <strong>一致性校验异常：</strong>
          {issues.join("；")}
        </div>
      )}

      {notices.length > 0 && (
        <div className="notice-stack">
          {notices.map((n, i) => (
            <div key={`${n.kind}-${i}`} className={`notice ${NOTICE_STYLE[n.kind]}`}>
              {n.text}
            </div>
          ))}
          <button type="button" className="notice-close" onClick={clearNotices}>
            知道了
          </button>
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "inspection" && <InspectionTab state={state} onApply={apply} />}
      {tab === "trend" && <TrendTab state={state} />}
      {tab === "orders" && <WorkOrdersTab state={state} onApply={apply} />}
      {tab === "batches" && <BatchesTab state={state} />}

      <footer className="page-footer">
        闭环规则：同一过滤器仅一张未关闭工单 · 更换前必须锁定读数 · 仅可领用有效期内批次并释放旧批次占用 · 复测未下降不得关闭 ·
        补录须带原因且保留旧值
      </footer>
    </main>
  );
}

export default App;
