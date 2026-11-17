// Screen-edge fit for the iPhone home-screen app.

/**
 * Bottom padding (px) of the tab bar. It must clear the home indicator (insetBottom), but
 * some iOS versions end the home-screen app's page *above* the indicator while still
 * reporting the inset — then padding by the inset again leaves an empty band under the
 * menu. The part of the inset the page already stops short of is not padded twice.
 */
export function tabBarPad({ screenH, viewH, insetBottom, standalone }) {
  const short = standalone ? Math.max(0, screenH - viewH) : 0;
  return Math.max(0, insetBottom - short) + 6;
}

function insetBottom() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)";
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}

export function screenInfo() {
  const portrait = window.innerHeight >= window.innerWidth;
  return {
    screenH: portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height),
    viewH: window.innerHeight,
    insetBottom: insetBottom(),
    standalone: navigator.standalone === true || matchMedia("(display-mode: standalone)").matches,
  };
}

export function fitScreen() {
  const apply = () => document.documentElement.style.setProperty("--tabs-pad", `${tabBarPad(screenInfo())}px`);
  apply();
  addEventListener("resize", apply);
  addEventListener("orientationchange", () => setTimeout(apply, 300));
}
