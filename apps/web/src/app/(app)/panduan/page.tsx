import type { Metadata } from "next";
import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight } from "lucide-react";
import { ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { PANDUAN, ROLE_SECTION, guideSections, headingId } from "@/content/panduan";
import { ApprovalFlow } from "@/components/erp/approval-flow";
import { GuideToc } from "@/components/erp/guide-toc";
import { PageHeader } from "@/components/erp/page-header";

export const metadata: Metadata = { title: "Panduan" };

const text = (children: React.ReactNode): string =>
  Array.isArray(children) ? children.map(text).join("") : typeof children === "string" ? children : "";

/** The guide's Markdown in the app's own type and table styles; "[[alur]]" draws the approval flow. */
const COMPONENTS: Components = {
  h2: ({ children }) => (
    <h2 id={headingId(text(children))} className="scroll-mt-20 border-t pt-8 text-xl font-semibold tracking-tight first:border-t-0 first:pt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingId(text(children))} className="scroll-mt-20 pt-2 text-base font-semibold">
      {children}
    </h3>
  ),
  p: ({ children }) => (text(children).trim() === "[[alur]]" ? <ApprovalFlow /> : <p className="leading-relaxed">{children}</p>),
  ul: ({ children }) => <ul className="grid list-disc gap-1.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="grid list-decimal gap-1.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-foreground font-medium not-italic">{children}</em>,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border-t px-3 py-2 align-top">{children}</td>,
};

export default async function PanduanPage() {
  const user = await requireUser();
  const sections = guideSections(PANDUAN);
  const start = sections.find((s) => s.id === ROLE_SECTION[user.actor.role]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Panduan" description="Cara memakai ERP Estrada dari awal sampai akhir, untuk setiap peran. Panduan ini diperbarui bersama aplikasi." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Daftar isi panduan" className="lg:sticky lg:top-20 lg:self-start">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Daftar isi</p>
          <GuideToc sections={sections} />
        </nav>
        <article className="grid max-w-3xl content-start gap-4 text-sm">
          {start ? (
            <Link
              href={`#${start.id}`}
              className="bg-primary/5 border-primary/20 hover:bg-primary/10 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <span>
                Anda masuk sebagai <strong className="font-semibold">{ROLE_LABEL[user.actor.role]}</strong>. Mulai dari bagian{" "}
                <strong className="font-semibold">{start.title}</strong>.
              </span>
              <ArrowRight aria-hidden className="text-primary size-4 shrink-0" />
            </Link>
          ) : null}
          <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
            {PANDUAN}
          </Markdown>
        </article>
      </div>
    </div>
  );
}
