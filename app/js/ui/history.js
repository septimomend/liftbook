import { allLogs, logsForExercise, getProgram } from "../store.js";
import { t, getLang } from "../i18n.js";
import { h, mount } from "../dom.js";

const setLabel = l => (l.done ? t("done") : `${l.weight}×${l.reps}`);
const dateFmt = ts => new Date(ts).toLocaleDateString(getLang(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export async function render(root, { params }) {
  const program = await getProgram();
  const names = new Map(program.days.flatMap(d => d.exercises.map(e => [e.id, e.name])));

  if (params.exerciseId) {
    const logs = (await logsForExercise(params.exerciseId)).sort((a, b) => b.ts - a.ts);
    const sessions = new Map();
    for (const l of logs) {
      if (!sessions.has(l.sessionId)) sessions.set(l.sessionId, []);
      sessions.get(l.sessionId).push(l);
    }
    mount(root,
      h("a", { class: "back", href: "#/history" }, t("‹ History")),
      h("h1", null, names.get(params.exerciseId) ?? logs[0]?.name ?? t("Exercise")),
      [...sessions.values()].map(sets => {
        sets.sort((a, b) => a.set - b.set);
        const performedNames = [...new Set(sets.map(s => s.name))];
        return h("div", { class: "card" },
          h("div", { class: "muted" }, dateFmt(sets[0].ts), performedNames.length ? ` · ${performedNames.join(", ")}` : ""),
          h("div", null, sets.map(setLabel).join(" · ")));
      }),
      logs.length ? null : h("p", { class: "muted" }, t("No sets logged yet.")),
    );
    return;
  }

  const logs = await allLogs();
  const latest = new Map();
  for (const l of logs) {
    const cur = latest.get(l.exerciseId);
    if (!cur || l.ts > cur.ts) latest.set(l.exerciseId, l);
  }
  const rows = [...latest.values()].sort((a, b) => b.ts - a.ts);
  mount(root,
    h("h1", null, t("History")),
    rows.length
      ? h("ul", { class: "list" }, rows.map(l => h("li", null,
          h("a", { href: `#/history/${encodeURIComponent(l.exerciseId)}` },
            names.get(l.exerciseId) ?? l.name,
            h("div", { class: "muted" }, `${dateFmt(l.ts)} · ${setLabel(l)}`)))))
      : h("p", { class: "muted" }, t("Nothing logged yet.")),
  );
}
