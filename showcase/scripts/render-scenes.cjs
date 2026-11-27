// Records the motion scenes to webm and renders caption cards to transparent PNGs. Usage: node render-scenes.cjs <outDir>
const { chromium } = require("/Volumes/EXTREMESSD/WWW/_github/fokusolusi/estrada-erp/node_modules/.pnpm/@playwright+test@1.56.1/node_modules/@playwright/test/index.js");
const path = require("path"), fs = require("fs");
const OUT = process.argv[2]; const D = path.resolve(__dirname, "../scenes");
const CAPS = { "02": "Satu tempat untuk RKA seluruh grup.", "03": "Lihat posisi setiap divisi di setiap tahap.", "04": "Isi anggaran per bulan, langsung di tabel.", "06": "Hasilnya terbaca di satu halaman.", "07": "Arus kas dan pipeline, dari data yang sama." };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const [name, secs] of [["01-logo", 6.0], ["05-route", 7.4], ["08-end", 4.2]]) {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT + "/tmp-" + name, size: { width: 1920, height: 1080 } } });
    const p = await ctx.newPage(); await p.goto("file://" + D + "/" + name + ".html");
    await p.waitForTimeout(secs * 1000); const v = p.video(); await ctx.close(); await v.saveAs(OUT + "/" + name + ".webm"); fs.rmSync(OUT + "/tmp-" + name, { recursive: true, force: true }); console.log("recorded", name);
  }
  for (const [k, t] of Object.entries(CAPS)) {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await ctx.newPage();
    await p.goto("file://" + D + "/cap.html#" + encodeURIComponent(t)); await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + "/cap-" + k + ".png", omitBackground: true }); await ctx.close();
  }
  await b.close(); console.log("captions done");
})();
