import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db, schema } from "@estrada/db";
import { COMPLIANCE_STATUSES, COMPLIANCE_STATUS_LABEL, can, complianceList, complianceSummary, type ComplianceStatus } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { ComplianceForm } from "@/components/erp/compliance-form";
import { PageHeader } from "@/components/erp/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveCompliance } from "./actions";

export const metadata: Metadata = { title: "Kepatuhan" };

const VARIANT: Record<ComplianceStatus, "default" | "secondary" | "outline" | "destructive"> = { to_implement: "destructive", in_progress: "secondary", implemented: "default", future: "outline" };

export default async function CompliancePage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "compliance.view", null, org)) redirect("/");
  const list = complianceList(await db.select().from(schema.complianceRecord));
  const summary = complianceSummary(list);
  const mayEdit = can(user.actor, "compliance.manage", null, org);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Kepatuhan" description={`${list.length} regulasi dan standar: ${COMPLIANCE_STATUSES.map((s) => `${summary[s]} ${COMPLIANCE_STATUS_LABEL[s].toLowerCase()}`).join(", ")}.`} />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regulasi · pasal</TableHead>
                <TableHead>Penerapan di ERP</TableHead>
                <TableHead>Bukti</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((i) => (
                <TableRow key={i.code} data-testid={`compliance-${i.code}`}>
                  <TableCell className="min-w-56 align-top whitespace-normal">
                    <span className="font-medium">{i.regulation}</span>
                    <span className="text-muted-foreground block text-xs">{i.clause}</span>
                    <span className="text-muted-foreground block text-xs">Area: {i.area}</span>
                  </TableCell>
                  <TableCell className="min-w-64 align-top whitespace-normal">{i.implementation}</TableCell>
                  <TableCell className="min-w-48 align-top whitespace-normal">
                    {i.evidence}
                    {i.evidenceUrl ? (
                      <a href={i.evidenceUrl} target="_blank" rel="noreferrer noopener" className="block text-xs underline underline-offset-4">
                        Buka bukti
                      </a>
                    ) : null}
                    {i.note ? <span className="text-muted-foreground block text-xs">{i.note}</span> : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="grid justify-items-start gap-2">
                      <Badge variant={VARIANT[i.status]}>{COMPLIANCE_STATUS_LABEL[i.status]}</Badge>
                      {mayEdit ? <ComplianceForm name={i.regulation} initial={{ code: i.code, status: i.status, evidenceUrl: i.evidenceUrl ?? "", note: i.note ?? "" }} onSave={saveCompliance} /> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
