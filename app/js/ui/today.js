import { getProgram, getSession, saveSession, lastLog } from "../store.js";
import { t } from "../i18n.js";
import { nextDay, newId } from "../model.js";
import { h, mount, fmtWeight } from "../dom.js";
import { runSync, syncConfigured } from "../sync-ui.js";

export async function render(root, { navigate, params }) {
  const program = await getProgram();
  const session = await getSession();

  if (session) {
    const day = program.days.find(d => d.id === session.dayId);
    root.append(
      h("h1", null, t("Workout in progress")),
      h("button", { class: "big primary", onClick: () => navigate("#/workout") }, day ? t("Resume {day}", { day: day.name }) : t("Resume workout")),
      h("button", { class: "link danger", onClick: async () => {
        if (!confirm(t("End this workout? Logged sets are kept."))) return;
        await saveSession(null);
        navigate("#/");
      } }, t("End workout")),
    );
    return;
  }

  if (!program.days.length) {
    root.append(
      h("h1", null, "Liftbook"),
      h("p", { class: "muted" }, t("No plan on this phone yet.")),
      syncConfigured()
        ? h("button", { class: "big primary", onClick: async e => {
            const btn = e.currentTarget; // null after the await
            btn.disabled = true;
            const r = await runSync(true);
            btn.disabled = false;
            if (r.ok) navigate("#/");
            else alert(r.reason === "offline" ? t("You're offline.") : t("Google sign-in didn't complete."));
          } }, t("Sign in to Google Drive"))
        : h("a", { class: "big primary", href: "#/settings" }, t("Sign in to Google Drive")),
      h("a", { class: "big", href: "#/settings" }, t("Import file")),
      h("a", { class: "link", href: "#/edit" }, t("or build a plan from scratch")),
    );
    return;
  }

  const last = await lastLog();
  const suggested = nextDay(program, last?.dayId ?? null);
  let selected = suggested;

  const start = async day => {
    await saveSession({ id: newId(), dayId: day.id, startedAt: Date.now(), index: 0, swaps: {}, restEndsAt: null });
    navigate("#/workout");
  };

  const card = h("section", { class: "today" });
  const chips = h("div", { class: "chips" });

  const draw = () => {
    const day = selected;
    mount(card, [
      h("div", { class: "muted" }, day.id === suggested.id ? t("Up next") : t("Selected")),
      h("h1", null, day.name),
      day.rest
        ? [h("p", { class: "rest-day" }, t("Rest day")),
           h("button", { class: "link", onClick: () => start(day) }, t("Train anyway"))]
        : [h("ul", { class: "plan-list" },
            day.exercises.map(e => h("li", null,
              h("span", null, e.name),
              h("b", null, e.type === "cardio" ? e.duration ?? "" : fmtWeight(e.weight))))),
           h("button", { class: "big primary", disabled: !day.exercises.length, onClick: () => start(day) }, t("Start {day}", { day: day.name }))],
    ]);
    chips.replaceChildren(...program.days.map(d =>
      h("button", { class: `chip${d.id === day.id ? " on" : ""}${d.rest ? " rest" : ""}`,
        onClick: () => { selected = d; draw(); } }, d.name)));
  };
  draw();
  root.append(chips, card);
}
