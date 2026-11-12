import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Private file storage for payment attachments. Production uses a private Supabase Storage bucket through its REST API
 * with the service key (never sent to the browser); development writes to a gitignored folder. Files are only ever
 * served back through the app, after its own permission check.
 */
const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? { url: env.SUPABASE_URL.replace(/\/$/, ""), key: env.SUPABASE_SERVICE_ROLE_KEY } : null;

const objectUrl = (key: string) => `${supabase!.url}/storage/v1/object/${env.STORAGE_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
const headers = () => ({ Authorization: `Bearer ${supabase!.key}`, apikey: supabase!.key });

function localPath(key: string) {
  const root = path.resolve(env.STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putFile(key: string, data: Uint8Array, contentType: string): Promise<void> {
  if (supabase) {
    const res = await fetch(objectUrl(key), {
      method: "POST",
      headers: { ...headers(), "Content-Type": contentType, "x-upsert": "false" },
      body: Buffer.from(data),
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
    return;
  }
  const full = localPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function getFile(key: string): Promise<Uint8Array> {
  if (supabase) {
    const res = await fetch(objectUrl(key), { headers: headers() });
    if (!res.ok) throw new Error(`Storage download failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await readFile(localPath(key)));
}
