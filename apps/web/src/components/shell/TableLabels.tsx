"use client";

import { useEffect } from "react";

/**
 * Presentation only. On phones the list tables (`.stack-table`) are drawn as stacked cards, and each value needs its
 * column name next to it. This copies the header text onto every cell as `data-label`, so the views keep their normal
 * accessible table markup and no data or behaviour changes. Cells under an empty or screen-reader-only header (Actions) are marked as actions.
 */
function label(table: HTMLTableElement) {
  const heads = Array.from(table.tHead?.rows[0]?.cells ?? []).map((h) =>
    h.querySelector(".sr-only") ? "" : (h.textContent ?? "").trim(),
  );
  for (const row of Array.from(table.tBodies[0]?.rows ?? [])) {
    const cells = Array.from(row.cells);
    if (cells.length !== heads.length) continue; // loading / empty / error rows span every column
    cells.forEach((cell, i) => {
      if (heads[i]) {
        if (cell.dataset.label !== heads[i]) cell.dataset.label = heads[i];
      } else if (cell.dataset.actions !== "1") {
        cell.dataset.actions = "1";
      }
    });
  }
}

export function TableLabels() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>("table.stack-table").forEach(label);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
