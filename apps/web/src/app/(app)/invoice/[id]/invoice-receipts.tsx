"use client";

import type { ComponentProps } from "react";
import { Receipts } from "@/components/erp/receipts";
import { recordReceipt, reverseReceipt } from "../receipt-actions";

export function InvoiceReceipts({ invoiceId, mayReverse, ...props }: { invoiceId: string; mayReverse: boolean } & Pick<ComponentProps<typeof Receipts>, "rows" | "form">) {
  return <Receipts {...props} onRecord={(v) => recordReceipt({ ...v, invoiceId })} onReverse={mayReverse ? reverseReceipt : null} />;
}
