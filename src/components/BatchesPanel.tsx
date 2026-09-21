import { batchRemaining, isBatchUsable, todayStr } from "../domain";
import { useStore } from "../store";
import { Badge } from "./common";

export function BatchesPanel() {
  const { state } = useStore();

  return (
    <section className="panel batches-panel">
      <div className="section-heading">
        <div>
          <p>备件批次</p>
          <h2>有效期与占用关系</h2>
        </div>
        <Badge tone="muted">今天 {todayStr()}</Badge>
      </div>
      <div className="batch-table-wrap">
        <table className="batch-table">
          <thead>
            <tr>
              <th>批次</th>
              <th>规格</th>
              <th>有效期至</th>
              <th>余量 / 总量</th>
              <th>当前占用过滤器</th>
            </tr>
          </thead>
          <tbody>
            {state.batches.map((b) => {
              const usable = isBatchUsable(b);
              const remaining = batchRemaining(b, state.filters);
              const holders = state.filters.filter((f) => f.installBatchId === b.id);
              return (
                <tr key={b.id} className={usable ? "" : "row-stale"}>
                  <td>
                    <code>{b.id}</code>
                  </td>
                  <td>{b.spec}</td>
                  <td>
                    {b.expiry} {usable ? <Badge tone="ok">有效</Badge> : <Badge tone="danger">已过期</Badge>}
                  </td>
                  <td>
                    <span className={remaining <= 0 ? "danger-text" : ""}>
                      {Math.max(remaining, 0)} / {b.totalQty}
                    </span>
                  </td>
                  <td>
                    {holders.length ? (
                      holders.map((f) => (
                        <Badge key={f.id} tone="info">
                          {f.id}
                        </Badge>
                      ))
                    ) : (
                      <span className="muted-text">空闲</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-note">更换工单完成时自动释放旧批次占用、绑定新批次；过期批次在更换环节不可选用。</p>
    </section>
  );
}
