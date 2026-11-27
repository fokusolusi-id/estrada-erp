"use client";

import type { ComponentProps } from "react";
import { InvoiceFormFields } from "@/components/erp/invoice-form";
import { saveInvoice } from "../actions";

export function EditInvoice({ id, dealId, terminNo, ...fields }: { id: string; dealId: string; terminNo: number } & Omit<ComponentProps<typeof InvoiceFormFields>, "onSave">) {
  return <InvoiceFormFields {...fields} onSave={(v) => saveInvoice(id, { ...v, dealId, terminNo })} />;
}
