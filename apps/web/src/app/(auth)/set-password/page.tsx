import type { Metadata } from "next";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Buat kata sandi" };

/** Used for both invitations and password resets. */
export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  return <SetPasswordForm token={token} />;
}
