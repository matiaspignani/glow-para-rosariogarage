// Runs at document_start: applies the per-feature switches before the first paint.
(() => {
  const root = document.documentElement;
  const apply = (off) => root.setAttribute("data-rg-off", Array.isArray(off) ? off.join(" ") : "");
  try {
    chrome.storage.sync.get("rgOff", (r) => apply(r && r.rgOff));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.rgOff) apply(changes.rgOff.newValue);
    });
  } catch {
    /* storage unavailable: every feature stays on */
  }
})();
