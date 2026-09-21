import { useMemo } from "react";
import "./styles.css";
import { BatchesPanel } from "./components/BatchesPanel";
import { InspectionForm } from "./components/InspectionForm";
import { InspectionsPanel } from "./components/InspectionsPanel";
import { TrendsPanel } from "./components/TrendsPanel";
import { WorkOrdersPanel } from "./components/WorkOrdersPanel";
import { isBatchUsable, isOrderOpen, trendOf } from "./domain";
import { useStore, StoreProvider } from "./store";
import { ROLES, Role } from "./types";

const project = {
  id: "hxwl-09",
  port: 5109,
  title: "半导体洁净室巡检",
  subtitle: "过滤器压差趋势监测与更换工单闭环：登记 → 自动建单 → 派工 → 锁定读数 → 备件更换 → 复测关闭",
  stack: "React + Vite + TypeScript + CSS",
};

function MetricCards() {
  const { state } = useStore();

  const metrics = useMemo(() => {
    const overLimit = state.filters.filter((f) => trendOf(state, f.id).overLimit).length;
    const rising = state.filters.filter((f) => trendOf(state, f.id).rising && !trendOf(state, f.id).overLimit).length;
    const open = state.orders.filter(isOrderOpen).length;
    const staleBatches = state.batches.filter((b) => !isBatchUsable(b)).length;
    return [
      { label: "超限过滤器", value: overLimit, cls: "status-danger" },
      { label: "连续上升（未超限）", value: rising, cls: "status-watch" },
      { label: "未关闭工单", value: open, cls: "status-watch" },
      { label: "过期备件批次", value: staleBatches, cls: "status-danger" },
    ];
  }, [state]);

  return (
    <section className="metrics-grid">
      {metrics.map((m) => (
        <article className="metric-card" key={m.label}>
          <span>{m.label}</span>
          <strong>{m.value}</strong>
          <i className={m.cls} />
        </article>
      ))}
    </section>
  );
}

function Shell() {
  const { role, setRole, reset, toasts } = useStore();

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
          <div className="role-switch">
            <span>当前角色</span>
            <div className="chips">
              {ROLES.map((r: Role) => (
                <button
                  key={r}
                  className={role === r ? "active" : ""}
                  onClick={() => setRole(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
          <span className="stack-note">
            角色权限：巡检员登记读数；厂务工程师/班组长派工、锁定、选批次更换、复测关闭、补录。
          </span>
          <button className="reset-btn" onClick={reset}>
            重置演示数据
          </button>
        </div>
      </section>

      <MetricCards />

      <InspectionForm />

      <TrendsPanel />

      <WorkOrdersPanel />

      <BatchesPanel />

      <InspectionsPanel />

      <footer className="page-foot">
        数据保存在浏览器 localStorage，刷新后趋势、工单状态与批次占用关系保持一致。
      </footer>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === "ok" ? "✓ " : "✕ "}
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

export default App;
