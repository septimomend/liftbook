import { getProgram, saveProgram, putImage } from "../store.js";
import { t, tn } from "../i18n.js";
import {
  DEFAULTS, newId, parseWeight, updateExercise, addExercise, removeExercise, moveExercise,
  addDay, removeDay, moveDay, updateDay,
} from "../model.js";
import { h, mount, picture, fmtWeight } from "../dom.js";

export async function render(root, ctx) {
  const { params } = ctx;
  if (params.exerciseId) return exerciseScreen(root, ctx);
  if (params.dayId) return dayScreen(root, ctx);
  return daysScreen(root, ctx);
}

const rowButtons = (onUp, onDown, onDelete) => [
  h("button", { class: "mini", "aria-label": t("Move up"), onClick: onUp }, "↑"),
  h("button", { class: "mini", "aria-label": t("Move down"), onClick: onDown }, "↓"),
  h("button", { class: "mini danger", "aria-label": t("Delete"), onClick: onDelete }, "✕"),
];

async function daysScreen(root, { navigate }) {
  let program = await getProgram();
  const save = async p => { program = p; await saveProgram(p); draw(); };
  const draw = () => mount(root,
    h("h1", null, t("Plan")),
    h("ul", { class: "list" }, program.days.map(d => h("li", null,
      h("a", { href: `#/edit/day/${encodeURIComponent(d.id)}` },
        d.name, h("div", { class: "muted" }, d.rest ? t("Rest day") : tn(d.exercises.length, "exercises"))),
      rowButtons(
        () => save(moveDay(program, d.id, -1)),
        () => save(moveDay(program, d.id, 1)),
        () => confirm(t("Delete {name} and its exercises?", { name: d.name })) && save(removeDay(program, d.id)))))),
    h("button", { class: "big", onClick: () => save(addDay(program,
      { id: newId(), name: t("Day {n}", { n: program.days.length + 1 }), rest: false, exercises: [] })) }, t("Add day")),
  );
  draw();
}

async function dayScreen(root, { navigate, params }) {
  let program = await getProgram();
  const dayId = params.dayId;
  const save = async p => { program = p; await saveProgram(p); draw(); };
  const draw = () => {
    const day = program.days.find(d => d.id === dayId);
    if (!day) { navigate("#/edit"); return; }
    const name = h("input", { name: "day-name", value: day.name });
    name.addEventListener("change", () => name.value.trim() && save(updateDay(program, dayId, { name: name.value.trim() })));
    const rest = h("input", { type: "checkbox", name: "rest", checked: day.rest, style: "width:auto;min-height:0" });
    rest.addEventListener("change", () => save(updateDay(program, dayId, { rest: rest.checked })));
    mount(root,
      h("a", { class: "back", href: "#/edit" }, t("‹ Plan")),
      h("label", null, t("Day name")), name,
      h("label", { style: "display:flex;gap:8px;align-items:center" }, rest, t("Rest day")),
      h("h2", null, t("Exercises")),
      h("ul", { class: "list" }, day.exercises.map(e => h("li", null,
        picture(e.image, "pic pic-thumb"),
        h("a", { href: `#/edit/ex/${encodeURIComponent(e.id)}` }, e.name,
          h("div", { class: "muted" }, `${e.group} · ${e.type === "cardio" ? e.duration ?? "" : `${fmtWeight(e.weight)} · ${e.sets}×${e.repsMin}–${e.repsMax}`}`)),
        rowButtons(
          () => save(moveExercise(program, e.id, -1)),
          () => save(moveExercise(program, e.id, 1)),
          () => confirm(t("Delete {name}?", { name: e.name })) && save(removeExercise(program, e.id)))))),
      h("button", { class: "big", onClick: async () => {
        const ex = { id: newId(), group: day.exercises.at(-1)?.group ?? "", name: t("New exercise"), type: "strength",
          weight: null, duration: null, sets: DEFAULTS.sets, repsMin: DEFAULTS.repsMin, repsMax: DEFAULTS.repsMax,
          image: null, alternatives: [] };
        program = addExercise(program, dayId, ex);
        await saveProgram(program);
        navigate(`#/edit/ex/${encodeURIComponent(ex.id)}`);
      } }, t("Add exercise")),
    );
  };
  draw();
}

/** Resize a picked photo to ≤ 800 px JPEG and store it; returns "idb:<id>". */
async function storePicture(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.8));
  const id = newId();
  await putImage({ id, type: "image/jpeg", blob });
  return `idb:${id}`;
}

function pictureField(image, name, onChange) {
  const input = h("input", { type: "file", accept: "image/*", name, style: "display:none" });
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (f) onChange(await storePicture(f));
  });
  return h("div", { class: "row", style: "align-items:center" },
    picture(image, "pic pic-thumb"),
    h("button", { onClick: () => input.click() }, image ? t("Change picture") : t("Add picture")),
    image ? h("button", { class: "link danger", onClick: () => onChange(null) }, t("Remove")) : null,
    input);
}

async function exerciseScreen(root, { navigate, params }) {
  let program = await getProgram();
  const id = params.exerciseId;
  const find = () => {
    for (const d of program.days) {
      const e = d.exercises.find(x => x.id === id);
      if (e) return { day: d, ex: e };
    }
    return null;
  };
  const patch = async (p, redraw = false) => {
    program = updateExercise(program, id, p);
    await saveProgram(program);
    if (redraw) draw();
  };

  const field = (label, name, value, onCommit, attrs = {}) => {
    const input = h("input", { name, value: value ?? "", ...attrs });
    input.addEventListener("change", () => onCommit(input.value, input));
    return [h("label", null, label), input];
  };
  const int = (v, min) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min ? n : null; };

  const draw = () => {
    const hit = find();
    if (!hit) { navigate("#/edit"); return; }
    const { day, ex } = hit;
    const type = h("select", { name: "type" },
      h("option", { value: "strength", selected: ex.type === "strength" }, t("Strength")),
      h("option", { value: "cardio", selected: ex.type === "cardio" }, t("Cardio")));
    type.addEventListener("change", () => patch({ type: type.value }, true));

    const alts = ex.alternatives.map((a, i) => {
      const setAlt = async (p, redraw = false) => {
        const list = ex.alternatives.map(x => (x.id === a.id ? { ...x, ...p } : x));
        await patch({ alternatives: list }, redraw);
        ex.alternatives = list;
      };
      return h("div", { class: "alt-edit" },
        field(t("Name"), `alt-name-${i}`, a.name, v => v.trim() && setAlt({ name: v.trim() })),
        field(t("Weight (kg, optional)"), `alt-weight-${i}`, a.weight, (v, input) => {
          if (v.trim() === "") return setAlt({ weight: null });
          const w = parseWeight(v);
          if (w == null) { input.setCustomValidity(t("Enter a number")); input.reportValidity(); return; }
          input.setCustomValidity("");
          setAlt({ weight: w });
        }, { inputmode: "decimal" }),
        h("label", null, t("Picture")),
        pictureField(a.image, `alt-picture-${i}`, img => setAlt({ image: img }, true)),
        h("button", { class: "link danger", onClick: () => confirm(t("Remove {name}?", { name: a.name })) &&
          patch({ alternatives: ex.alternatives.filter(x => x.id !== a.id) }, true) }, t("Remove alternative")));
    });

    mount(root, [
      h("a", { class: "back", href: `#/edit/day/${encodeURIComponent(day.id)}` }, `‹ ${day.name}`),
      field(t("Exercise name"), "name", ex.name, v => v.trim() && patch({ name: v.trim() })),
      field(t("Muscle group"), "group", ex.group, v => patch({ group: v.trim() })),
      h("label", null, t("Type")), type,
      ex.type === "cardio"
        ? field(t("Duration"), "duration", ex.duration, v => patch({ duration: v.trim() || null }), { placeholder: "20-25 min" })
        : [
            field(t("Working weight (kg)"), "weight", ex.weight, (v, input) => {
              if (v.trim() === "") return patch({ weight: null });
              const w = parseWeight(v);
              if (w == null) { input.setCustomValidity(t("Enter a number")); input.reportValidity(); return; }
              input.setCustomValidity("");
              patch({ weight: w });
            }, { inputmode: "decimal" }),
            h("div", { class: "row" },
              h("div", null, field(t("Sets"), "sets", ex.sets, v => int(v, 1) && patch({ sets: int(v, 1) }), { inputmode: "numeric" })),
              h("div", null, field(t("Reps min"), "repsMin", ex.repsMin, v => int(v, 1) && patch({ repsMin: int(v, 1) }), { inputmode: "numeric" })),
              h("div", null, field(t("Reps max"), "repsMax", ex.repsMax, v => int(v, 1) && patch({ repsMax: int(v, 1) }), { inputmode: "numeric" }))),
          ],
      h("label", null, t("Picture")),
      pictureField(ex.image, "picture", img => patch({ image: img }, true)),
      h("h2", null, t("Alternatives")),
      alts,
      h("button", { class: "big", onClick: () => patch({ alternatives: [...ex.alternatives,
        { id: newId(), name: t("Alternative"), weight: null, image: null }] }, true) }, t("Add alternative")),
    ]);
  };
  draw();
}
