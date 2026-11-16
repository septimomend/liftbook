import {
  getProgram, saveProgram, getSession, saveSession, getSettings,
  addLog, deleteLog, logsForExercise,
} from "../store.js";
import { newId, parseWeight, performed, setWorkingWeight, lastSessionSets } from "../model.js";
import { startRest, fmt } from "../timer.js";
import { h, mount, picture, fmtWeight } from "../dom.js";
import { showRest } from "./rest.js";
import { runSync, syncConfigured } from "../sync-ui.js";

const setLabel = l => (l.done ? "done" : `${l.weight}×${l.reps}`);

export async function render(root, { navigate }) {
  let session = await getSession();
  if (!session) {
    navigate("#/");
    return;
  }
  let program = await getProgram();
  const settings = await getSettings();
  let rest = null;
  let editingWeight = false;

  const day = () => program.days.find(d => d.id === session.dayId);

  const persistSession = async patch => {
    session = { ...session, ...patch };
    await saveSession(session);
  };

  const openRest = (caption) => {
    rest?.destroy();
    rest = showRest(document.body, {
      endsAt: session.restEndsAt,
      caption,
      onChange: end => persistSession({ restEndsAt: end }),
      onClose: () => { rest = null; persistSession({ restEndsAt: null }); },
    });
  };

  async function draw() {
    const d = day();
    if (!d || !d.exercises.length) {
      await saveSession(null);
      navigate("#/");
      return;
    }
    const index = Math.min(session.index, d.exercises.length - 1);
    const ex = d.exercises[index];
    const altId = session.swaps[ex.id] ?? null;
    const perf = performed(ex, altId);
    const logs = await logsForExercise(ex.id);
    const mine = logs.filter(l => l.sessionId === session.id).sort((a, b) => a.set - b.set);
    const last = lastSessionSets(logs, ex.id, session.id);
    const isCardio = ex.type === "cardio";
    const nextSet = mine.length + 1;

    // weight (tap to edit -> updates the plan)
    let weightEl;
    if (isCardio) {
      weightEl = h("div", { class: "w-weight" }, ex.duration ?? "");
    } else if (editingWeight) {
      const input = h("input", { name: "working-weight", inputmode: "decimal", value: perf.weight ?? "", enterkeyhint: "done" });
      const save = async () => {
        const w = parseWeight(input.value);
        if (w == null) { input.setCustomValidity("Enter a weight"); input.reportValidity(); return; }
        program = setWorkingWeight(program, ex.id, altId, w);
        await saveProgram(program);
        editingWeight = false;
        draw();
      };
      input.addEventListener("keydown", e => e.key === "Enter" && save());
      weightEl = h("div", { class: "row" }, input,
        h("button", { class: "primary", onClick: save }, "Save"),
        h("button", { onClick: () => { editingWeight = false; draw(); } }, "Cancel"));
      queueMicrotask(() => input.focus());
    } else {
      weightEl = h("button", { class: "w-weight", onClick: () => { editingWeight = true; draw(); } },
        fmtWeight(perf.weight), h("small", null, "✎ edit"));
    }

    // logging controls
    let logRow;
    if (isCardio) {
      logRow = h("button", { class: "big primary", onClick: async () => {
        await addLog({ id: newId(), sessionId: session.id, ts: Date.now(), dayId: d.id, exerciseId: ex.id,
          altId, name: perf.name, set: nextSet, weight: null, reps: null, done: true });
        draw();
      } }, "Done");
    } else {
      const wIn = h("input", { name: "log-weight", inputmode: "decimal", value: perf.weight ?? "", "aria-label": "Weight" });
      const rIn = h("input", { name: "log-reps", inputmode: "numeric", value: ex.repsMax, "aria-label": "Reps" });
      const btn = h("button", { class: "big primary" }, `Log set & rest ${fmt(settings.restSec)}`);
      const validate = () => {
        btn.disabled = parseWeight(wIn.value) == null || !(parseInt(rIn.value, 10) > 0);
      };
      const step = (input, delta, isWeight) => () => {
        const cur = isWeight ? parseWeight(input.value) ?? 0 : parseInt(input.value, 10) || 0;
        input.value = String(Math.max(0, Math.round((cur + delta) * 100) / 100));
        validate();
      };
      wIn.addEventListener("input", validate);
      rIn.addEventListener("input", validate);
      btn.addEventListener("click", async () => {
        const weight = parseWeight(wIn.value);
        const reps = parseInt(rIn.value, 10);
        if (weight == null || !(reps > 0)) return;
        await addLog({ id: newId(), sessionId: session.id, ts: Date.now(), dayId: d.id, exerciseId: ex.id,
          altId, name: perf.name, set: nextSet, weight, reps });
        await persistSession({ restEndsAt: startRest(Date.now(), settings.restSec) });
        await draw();
        openRest(`Resting · next: set ${nextSet + 1} of ${perf.name}`);
      });
      validate();
      logRow = [
        h("div", { class: "row" },
          h("div", { class: "stepper" }, h("button", { onClick: step(wIn, -2.5, true), "aria-label": "Less weight" }, "−"), wIn, h("span", { class: "unit" }, "kg"), h("button", { onClick: step(wIn, 2.5, true), "aria-label": "More weight" }, "+")),
          h("div", { class: "stepper" }, h("button", { onClick: step(rIn, -1), "aria-label": "Fewer reps" }, "−"), rIn, h("span", { class: "unit" }, "reps"), h("button", { onClick: step(rIn, 1), "aria-label": "More reps" }, "+"))),
        btn,
      ];
    }

    const isLast = index === d.exercises.length - 1;
    const go = async delta => {
      editingWeight = false;
      await persistSession({ index: index + delta });
      draw();
    };

    mount(root, [
      h("div", { class: "w-head" }, h("span", null, `${d.name} · ${ex.group}`), h("span", null, `${index + 1} / ${d.exercises.length}`)),
      perf.image ? picture(perf.image, "pic pic-hero") : null,
      h("div", { class: "w-name" }, perf.name),
      weightEl,
      isCardio ? null : h("div", { class: "w-target" }, `Set ${Math.min(nextSet, Math.max(ex.sets, nextSet))} of ${ex.sets} · ${ex.repsMin}–${ex.repsMax} reps`),
      mine.length ? h("div", { class: "w-sets" }, mine.map(l => h("button", { class: "set", title: "Tap to delete", onClick: async () => {
        if (!confirm(`Delete set ${l.set} (${setLabel(l)})?`)) return;
        await deleteLog(l.id);
        draw();
      } }, setLabel(l)))) : null,
      last.length ? h("div", { class: "w-last" }, `Last time: ${last.map(setLabel).join(" · ")}`) : null,
      logRow,
      ex.alternatives.length ? h("div", { class: "alts" },
        h("div", { class: "muted" }, "Alternatives"),
        ex.alternatives.map(a => h("button", { class: `alt${a.id === altId ? " on" : ""}`, onClick: async () => {
          editingWeight = false;
          const swaps = { ...session.swaps };
          if (swaps[ex.id] === a.id) delete swaps[ex.id];
          else swaps[ex.id] = a.id;
          await persistSession({ swaps });
          draw();
        } }, picture(a.image, "pic pic-thumb"), h("span", { class: "grow" }, a.name), h("b", null, fmtWeight(a.weight)))),
        altId ? h("button", { class: "link", onClick: async () => {
          const swaps = { ...session.swaps };
          delete swaps[ex.id];
          await persistSession({ swaps });
          draw();
        } }, "Back to main") : null) : null,
      h("div", { class: "w-nav" },
        h("button", { disabled: index === 0, onClick: () => go(-1) }, "Prev"),
        isLast
          ? h("button", { class: "primary", onClick: async () => {
              rest?.destroy();
              const sync = syncConfigured() ? runSync(true) : null; // from the tap: may ask "Continue as …"
              await saveSession(null);
              navigate("#/");
              await sync;
            } }, "Finish")
          : h("button", { onClick: () => go(1) }, "Next")),
    ]);
  }

  await draw();
  if (session.restEndsAt) openRest("Resting");

  return {
    cleanup: () => rest?.destroy(),
    refresh: () => rest?.refresh(),
  };
}
