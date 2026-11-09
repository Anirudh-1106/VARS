// Shell behaviour shared by every page: mobile menu, nav status tags and
// the "clear this session" control.

import { store } from "./store.js";
import { confirmDialog, pnrClass, pnrText, toast } from "./ui.js";
import { readinessFor } from "./resume-model.js";

const rail = document.getElementById("rail");
const menuBtn = rail?.querySelector(".menu-btn");
menuBtn?.addEventListener("click", () => {
  const open = rail.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll("[data-clear-session]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Clear this session?",
      body: "Your resume analysis, chat, interview answers and reports in this tab will be erased. Export anything you want to keep first.",
      confirm: "Clear everything",
      danger: true,
    });
    if (!ok) return;
    store.clear();
    toast("Session cleared. Nothing from it remains in this browser.", "ok");
    setTimeout(() => location.assign("/"), 600);
  }),
);

function paintNav() {
  const s = store.state;
  const studioTag = document.querySelector('[data-nav-status="studio"]');
  if (studioTag) {
    const status = s.resume?.analysis ? readinessFor(s.resume) : null;
    studioTag.hidden = !status;
    if (status) {
      studioTag.textContent = pnrText(status);
      studioTag.dataset.code = pnrClass(status);
    }
  }
  const reportTag = document.querySelector('[data-nav-status="report"]');
  if (reportTag) {
    const latest = s.reports?.[0];
    reportTag.hidden = !latest;
    if (latest) reportTag.textContent = pnrText(latest.report.status);
  }
}

paintNav();
store.subscribe(paintNav);
