"use client";

import type { ComponentProps } from "react";
import { InvoiceFormFields } from "@/components/erp/invoice-form";
import { saveInvoice } from "../actions";

export function NewInvoice({ dealId, terminNo, ...fields }: { dealId: string; terminNo: number } & Omit<ComponentProps<typeof InvoiceFormFields>, "onSave">) {
  return <InvoiceFormFields {...fields} onSave={(v) => saveInvoice(null, { ...v, dealId, terminNo })} />;
}
