"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { PAYMENT_TERMS, PIC_ROLES, canContract, contractProblem, type ContractProblem } from "@estrada/domain";
import { loadProjects } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const MESSAGE: Record<ContractProblem, string> = {
  number: "Isi nomor kontrak.",
  date: "Isi tanggal kontrak, tidak sesudah hari ini.",
  p8: "BCD belum mencatat tanggal terima P8/SPPBJ.",
  order: "Tanggal kontrak tidak boleh sebelum tanggal terima P8/SPPBJ.",
  duration: "Isi durasi kontrak.",
  term: "Pilih term of payment.",
};
const REFUSAL = {
  p8: "Tanggal terima P8/SPPBJ dicatat BCD.",
  contract: "Data kontrak dicatat Legal & Contract Management.",
  pic: "PIC proyek ditetapkan Head PMO.",
};
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

async function open(projectId: string, section: keyof typeof REFUSAL) {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(projectId).success) return { refused: { ok: false, message: "Permintaan tidak valid." } };
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canContract(user.actor, section, project, org)) return { refused: { ok: false, message: REFUSAL[section] } };
  return { user, project };
}

async function write(userId: string, projectId: string, section: string, before: unknown, patch: Partial<typeof schema.project.$inferInsert>, message: string): Promise<Result> {
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ ...patch, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: userId, action: `project.contract_${section}`, subjectType: "project", subjectId: projectId, before, after: patch });
  });
  revalidatePath(`/implementasi/${projectId}`);
  return { ok: true, message };
}

export async function saveP8(projectId: string, receivedOn: string): Promise<Result> {
  const s = await open(projectId, "p8");
  if ("refused" in s) return s.refused!;
  if (!day.safeParse(receivedOn).success || receivedOn > todayJakarta()) return { ok: false, message: "Isi tanggal terima, tidak sesudah hari ini." };
  const signed = s.project.contract.date;
  if (signed && signed < receivedOn) return { ok: false, message: MESSAGE.order };
  return write(s.user.id, projectId, "p8", { p8On: s.project.contract.p8On }, { p8ReceivedOn: receivedOn }, "Tanggal terima P8/SPPBJ disimpan.");
}

const Contract = z.object({ number: z.string().trim().max(100), date: z.string().max(10), duration: z.string().trim().max(100), term: z.enum(PAYMENT_TERMS).nullable() });

export async function saveContractRecord(projectId: string, input: z.input<typeof Contract>): Promise<Result> {
  const s = await open(projectId, "contract");
  if ("refused" in s) return s.refused!;
  const parsed = Contract.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian kontrak." };
  const v = parsed.data;
  const problem = contractProblem({ ...v, p8On: s.project.contract.p8On, today: todayJakarta() });
  if (problem) return { ok: false, message: MESSAGE[problem] };
  // One contract number per customer (sheet FC04_Projek).
  const [deal] = await db.select({ customerId: schema.pipelineDeal.customerId, customer: schema.pipelineDeal.customer }).from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, s.project.dealId));
  const twins = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
    .where(
      and(
        ne(schema.project.id, projectId),
        deal?.customerId ? eq(schema.pipelineDeal.customerId, deal.customerId) : eq(schema.pipelineDeal.customer, deal?.customer ?? ""),
        sql`lower(${schema.project.contractNo}) = ${v.number.toLowerCase()}`,
      ),
    );
  if (twins.length) return { ok: false, message: "Nomor kontrak ini sudah dipakai proyek lain dari customer yang sama." };
  return write(
    s.user.id,
    projectId,
    "record",
    s.project.contract,
    { contractNo: v.number, contractDate: v.date, contractDuration: v.duration, paymentTerm: v.term },
    "Data kontrak disimpan.",
  );
}

const Pics = z.object(Object.fromEntries(PIC_ROLES.map((r) => [r, z.string().max(40)])) as Record<(typeof PIC_ROLES)[number], z.ZodString>);

export async function savePics(projectId: string, input: z.input<typeof Pics>): Promise<Result> {
  const s = await open(projectId, "pic");
  if ("refused" in s) return s.refused!;
  const parsed = Pics.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const known = new Set((await db.select({ nip: schema.employee.nip }).from(schema.employee).where(eq(schema.employee.active, true))).map((e) => e.nip));
  // Someone who has since left stays until replaced.
  if (PIC_ROLES.some((r) => v[r] && !known.has(v[r]) && v[r] !== s.project.contract.pics[r])) return { ok: false, message: "PIC harus karyawan aktif." };
  return write(
    s.user.id,
    projectId,
    "pic",
    s.project.contract.pics,
    { picLegalNip: v.legal || null, picScmNip: v.scm || null, picPmNip: v.pm || null, picOpsNip: v.ops || null, picHrdNip: v.hrd || null, picFinanceNip: v.finance || null },
    "PIC disimpan.",
  );
}
