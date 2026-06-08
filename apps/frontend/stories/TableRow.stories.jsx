export default {
  title: "Shared/TableRow"
};

function ExampleTable({ rowClassName }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--outline)] bg-[color:var(--surface)] p-2">
      <table className="ui-listing-table w-full border-separate border-spacing-y-2 text-sm">
        <thead>
          <tr className="bg-[color:rgba(129,135,255,0.12)] text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            <th className="ui-listing-head-cell px-3 py-2 text-left">KID</th>
            <th className="ui-listing-head-cell px-3 py-2 text-left">Place</th>
            <th className="ui-listing-head-cell px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className={rowClassName}>
            <td className="ui-listing-cell px-3 py-3">544346381</td>
            <td className="ui-listing-cell px-3 py-3">A-12</td>
            <td className="ui-listing-cell px-3 py-3">listed</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function EvenRow() {
  return <ExampleTable rowClassName="rounded-xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.035)]" />;
}

export function OddRow() {
  return <ExampleTable rowClassName="rounded-xl border border-[color:var(--outline)] bg-[color:rgba(255,255,255,0.22)]" />;
}
