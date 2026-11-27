// Records the app scenes as 1920x1080 webm files. Usage: node capture.cjs <auth.json> <outDir>
const { chromium } = require("/Volumes/EXTREMESSD/WWW/_github/fokusolusi/estrada-erp/node_modules/.pnpm/@playwright+test@1.56.1/node_modules/@playwright/test/index.js");
const fs = require("fs");
const [,, AUTH, OUT] = process.argv;
const BASE = "http://localhost:3000";
const wait = (p, ms) => p.waitForTimeout(ms);

async function actAs(page, prefix) {
  const sel = page.locator('select[aria-label="Bertindak sebagai"]');
  if (!(await sel.count())) return false;
  const opt = await sel.locator("option").evaluateAll((os, pre) => os.find((o) => o.textContent.startsWith(pre))?.value, prefix);
  if (!opt) return false;
  await sel.selectOption(opt);
  await page.waitForLoadState("networkidle");
  await wait(page, 800);
  return true;
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
async function scene(browser, name, { auth = true, run }) {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: "light",
    locale: "id-ID",
    storageState: auth ? AUTH : undefined,
    recordVideo: { dir: OUT + "/tmp-" + name, size: { width: 1920, height: 1080 } },
  });
  await ctx.addInitScript(() => {
    // The Next.js dev badge must not appear in the footage.
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important}" +
        // Brand block (logo and name) in the sidebar and on the sign-in panel, its footer line, and the signed-in user are hidden.
        "aside>div:first-child,aside>p,button[aria-label^='Menu pengguna']{visibility:hidden!important}";
      document.head.appendChild(st);
      // The old company name inside the data (the ESTRADA entity row, headers) is hidden as it appears.
      setInterval(() => {
        document.querySelectorAll("td,th,span,div,li,p,h1,h2,h3").forEach((e) => {
          if (e.children.length <= 1 && e.textContent.length < 60 && /estrada|elang strategi/i.test(e.textContent)) e.style.visibility = "hidden";
        });
      }, 200);
    });
  });
  const page = await ctx.newPage();
  await run(page);
  const video = page.video();
  await ctx.close();
  await video.saveAs(OUT + "/" + name + ".webm");
  fs.rmSync(OUT + "/tmp-" + name, { recursive: true, force: true });
  console.log("recorded", name);
}

async function slowScroll(page, to, ms) {
  await page.evaluate(async ([to, ms]) => {
    const start = scrollY, t0 = performance.now();
    await new Promise((res) => {
      const f = (t) => { const k = Math.min(1, (t - t0) / ms); scrollTo(0, start + (to - start) * (k < .5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2)); k < 1 ? requestAnimationFrame(f) : res(); };
      requestAnimationFrame(f);
    });
  }, [to, ms]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Warm-up: visit every page once so the dev server has compiled them.
  {
    const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1920, height: 1080 } });
    const p = await ctx.newPage();
    for (const u of ["/", "/rka", "/summary", "/cash", "/pipeline"]) { await p.goto(BASE + u); await p.waitForLoadState("networkidle"); }
    await ctx.close();
    const c2 = await browser.newContext(); const p2 = await c2.newPage(); await p2.goto(BASE + "/login"); await p2.waitForLoadState("networkidle"); await c2.close();
  }

  await scene(browser, "02-signin", { auth: false, run: async (p) => {
    await p.goto(BASE + "/login"); await p.waitForLoadState("networkidle"); await wait(p, 4500);
  }});

  await scene(browser, "03-beranda", { run: async (p) => {
    await p.goto(BASE + "/"); await p.waitForLoadState("networkidle");
    await actAs(p, "Direktur"); await p.goto(BASE + "/"); await p.waitForLoadState("networkidle");
    // The greeting carries the user's name.
    await p.evaluate(() => document.querySelectorAll("h1").forEach((h) => /^Halo,/.test(h.textContent) && (h.style.visibility = "hidden")));
    await wait(p, 1500); await slowScroll(p, 420, 2500); await wait(p, 2500);
  }});

  await scene(browser, "04-rka", { run: async (p) => {
    await p.goto(BASE + "/rka"); await p.waitForLoadState("networkidle");
    await actAs(p, "Requestor · Business Finance"); await p.goto(BASE + "/rka"); await p.waitForLoadState("networkidle");
    await wait(p, 1500);
    const add = p.getByRole("button", { name: "Tambah baris" });
    await add.waitFor({ state: "visible" }); await wait(p, 2500);
    if (!(await add.isEnabled())) { await p.screenshot({ path: OUT + "/debug-04.png" }); throw new Error("Tambah baris disabled"); }
    await add.click(); await wait(p, 1200);
    const inputs = p.locator("table tbody tr input:not([type=checkbox]):not([placeholder='Uraian'])");
    for (let i = 0; i < 3; i++) { const el = inputs.nth(i); await el.click(); await p.keyboard.type(["12000000", "12000000", "15000000"][i], { delay: 140 }); await wait(p, 500); }
    await wait(p, 2200);
  }});

  await scene(browser, "06-summary", { run: async (p) => {
    await p.goto(BASE + "/summary"); await p.waitForLoadState("networkidle");
    await actAs(p, "Direktur"); await p.goto(BASE + "/summary"); await p.waitForLoadState("networkidle");
    await p.locator(".recharts-surface").first().waitFor({ state: "visible" }); await wait(p, 2500); await slowScroll(p, 520, 3000); await wait(p, 2500);
  }});

  await scene(browser, "07-cash-pipeline", { run: async (p) => {
    await p.goto(BASE + "/"); await p.waitForLoadState("networkidle"); await actAs(p, "Direktur");
    await p.goto(BASE + "/cash"); await p.waitForLoadState("networkidle"); await wait(p, 3200);
    await p.goto(BASE + "/pipeline"); await p.waitForLoadState("networkidle"); await wait(p, 2600);
  }});

  await browser.close();
})();
