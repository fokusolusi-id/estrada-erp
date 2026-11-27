// Opens a visible browser at the local app. Sign in with a demo account, then close the window:
// the session is saved to the path given as argument, outside the repository.
const { chromium } = require("/Volumes/EXTREMESSD/WWW/_github/fokusolusi/estrada-erp/node_modules/.pnpm/@playwright+test@1.56.1/node_modules/@playwright/test/index.js");
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "id-ID" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/login");
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 600000 });
  await ctx.storageState({ path: out });
  console.log("saved");
  await b.close();
})();
