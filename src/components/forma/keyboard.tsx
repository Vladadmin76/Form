import { useEffect } from "react";

function isTextField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !["checkbox", "radio", "button", "file", "range", "color", "submit", "reset", "hidden"].includes(target.type);
}

/** Keeps the focused field above the iOS keyboard and its prev/next bar. */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    let baseHeight = window.innerHeight;
    let ticket = 0;

    const apply = () => {
      const active = document.activeElement;
      const focused = isTextField(active);
      const vv = window.visualViewport;
      const raw = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      if (!focused && raw < 80) baseHeight = window.innerHeight;
      const resized = window.innerHeight < baseHeight - 140;
      const overlay = raw > 140;
      const open = overlay || (focused && touch && !resized);
      const pad = overlay ? raw : open ? Math.round(baseHeight * 0.42) : 0;
      const inSheet = focused && !!active.closest("[data-sheet]");
      root.dataset.kb = open ? "1" : "0";
      root.dataset.sheetLift = inSheet && open ? "1" : "0";
      root.style.setProperty("--kb", `${Math.round(pad)}px`);
    };

    const reveal = (el: HTMLElement) => {
      if (el.closest("[data-sheet]")) {
        const y = window.scrollY;
        window.requestAnimationFrame(() => window.scrollTo(0, y));
        return;
      }
      const vv = window.visualViewport;
      const pad = Number.parseFloat(getComputedStyle(root).getPropertyValue("--kb")) || 0;
      const overlay = vv ? window.innerHeight - vv.height - vv.offsetTop > 140 : false;
      const top = overlay && vv ? vv.offsetTop : 0;
      const height = overlay && vv ? vv.height : window.innerHeight - pad;
      const visibleTop = top + 12;
      const visibleBottom = top + height - 16;
      const rect = el.getBoundingClientRect();
      if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;
      window.scrollBy(0, rect.top - (visibleTop + 56));
    };

    const onViewport = () => apply();

    const onFocus = (event: FocusEvent) => {
      if (!isTextField(event.target)) return;
      const el = event.target;
      const mine = ++ticket;
      apply();
      window.setTimeout(() => {
        if (mine !== ticket) return;
        apply();
        reveal(el);
        window.setTimeout(() => {
          if (mine !== ticket) return;
          reveal(el);
        }, 400);
      }, 280);
    };

    const onBlur = () => {
      const mine = ++ticket;
      window.setTimeout(() => {
        if (mine !== ticket) return;
        if (!isTextField(document.activeElement)) apply();
      }, 60);
    };

    apply();
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    window.addEventListener("resize", onViewport);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.removeEventListener("resize", onViewport);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      ticket += 1;
      root.dataset.kb = "0";
      root.dataset.sheetLift = "0";
      root.style.removeProperty("--kb");
    };
  }, []);

  return null;
}
