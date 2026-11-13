"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TABS, tabFromPath } from "@/lib/tabs";
import { isLightColour } from "@/lib/types";

/**
 * Folder tabs and the coloured folder body. It lives in the case layout, so it stays on screen
 * while only the tab's content changes — switching tabs keeps your scroll position.
 */
export function CaseFolder({ code, theme, children }: { code: string; theme: string; children: ReactNode }) {
  const tab = tabFromPath(usePathname());
  return (
    <main>
      <nav className="tabs" aria-label="Case sections">
        {TABS.map((t) => (
          <Link
            key={t.name}
            href={`/cases/${code}${t.path}`}
            scroll={false}
            className="tab"
            style={{ "--t": t.colour } as React.CSSProperties}
            aria-current={t === tab ? "page" : undefined}
            data-light={isLightColour(t.colour) || undefined}
          >
            {t.name}
          </Link>
        ))}
      </nav>
      <div className="folder" style={{ "--folder": tab.colour } as React.CSSProperties} data-light={isLightColour(tab.colour) || undefined}>
        <div className="folder-cap">
          <span>
            File {code} / {tab.name}
          </span>
          <span>{theme}</span>
        </div>
        <div className="pane">{children}</div>
      </div>
    </main>
  );
}
