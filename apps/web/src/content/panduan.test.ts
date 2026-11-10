import { describe, expect, it } from "vitest";
import { APPROVAL_STATES, ROLES, ROLE_LABEL } from "@estrada/domain";
import { NAV } from "@/lib/nav";
import { STATE_LABEL } from "@/components/erp/status-badge";
import { PANDUAN, ROLE_SECTION, guideSections } from "./panduan";

/**
 * The Panduan must follow the app. A screen added to the menu, a state or a role the guide does not mention
 * fails here, so the guide is updated in the same change as the feature.
 */
describe("Panduan", () => {
  it("describes every screen in the menu", () => {
    const missing = NAV.filter((n) => n.href !== "/panduan" && !n.phase && !PANDUAN.includes(n.label)).map((n) => n.label);
    expect(missing).toEqual([]);
  });

  it("names every approval state and every role", () => {
    expect(APPROVAL_STATES.filter((s) => !PANDUAN.includes(STATE_LABEL[s]))).toEqual([]);
    expect(ROLES.filter((r) => !PANDUAN.includes(ROLE_LABEL[r]))).toEqual([]);
  });

  it("points each role at a section that exists", () => {
    const ids = guideSections(PANDUAN).map((s) => s.id);
    for (const r of ROLES) expect(ids).toContain(ROLE_SECTION[r]);
  });

  it("lists its sections for the contents, with ids for links", () => {
    const sections = guideSections("## Alur RKA\n\ntext\n\n## Requestor: isi dan kirim\n\n### Sub\n");
    expect(sections).toEqual([
      { id: "alur-rka", title: "Alur RKA" },
      { id: "requestor-isi-dan-kirim", title: "Requestor: isi dan kirim" },
    ]);
  });
});
