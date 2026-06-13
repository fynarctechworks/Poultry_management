'use client';

// =============================================================================
// Payment-successful receipt shown on the onboarding "Complete" step.
// Renders an invoice-style card and offers a client-side PDF download (the
// onboarding sandbox payment has no server invoice row, so the PDF is built
// in-browser with jsPDF). Mirrors the look of a standard payment receipt.
// =============================================================================

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { ReceiptText, Download, Loader2 } from 'lucide-react';

export interface ReceiptData {
  invoiceNumber: string;
  orderTimeISO: string;
  method: string;          // e.g. "Card •••• 1111"
  billingName: string;
  planName: string;
  cycle: 'monthly' | 'yearly';
  subtotal: number;
  tax: number;
  total: number;
  firstChargeISO: string | null;
}

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function PaymentReceipt({ data }: { data: ReceiptData }) {
  const [downloading, setDownloading] = useState(false);
  const lineLabel = `${data.planName} plan (${data.cycle}) ×1`;

  function downloadPdf() {
    setDownloading(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: [320, 560] });
      const cx = 160;
      let y = 48;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PoultryOS', cx, y, { align: 'center' });
      y += 22;
      doc.setFontSize(13);
      doc.text('Payment Successful', cx, y, { align: 'center' });
      y += 26;
      doc.setDrawColor(222);
      doc.line(28, y, 292, y);
      y += 24;

      const row = (k: string, v: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(10);
        doc.setTextColor(bold ? 16 : 104, bold ? 17 : 107, bold ? 20 : 130);
        doc.text(k, 28, y);
        doc.setTextColor(16, 17, 20);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.text(v, 292, y, { align: 'right' });
        y += 20;
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(16, 17, 20);
      doc.text('Payment Details', 28, y); y += 20;
      row('Invoice Number', data.invoiceNumber);
      row('Order Time', dateTime(data.orderTimeISO));
      row('Payment Method', data.method);
      row('Payment Status', 'Successful');
      row('Amount', inr(data.total));
      y += 8;
      doc.line(28, y, 292, y); y += 22;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Product Details', 28, y); y += 20;
      row(lineLabel, inr(data.subtotal));
      row('GST (18%)', inr(data.tax));
      row('Total Amount', inr(data.total), true);

      if (data.firstChargeISO) {
        y += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 151, 169);
        doc.text(`Billed after your 7-day free trial — first charge on ${dateOnly(data.firstChargeISO)}.`, cx, y, { align: 'center', maxWidth: 264 });
      }

      doc.save(`${data.invoiceNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[360px] rounded-card border border-mute bg-canvas p-lg text-left shadow-sm">
      <div className="mb-md flex flex-col items-center text-center">
        <span className="mb-sm grid h-12 w-12 place-items-center rounded-full bg-primary-subtle text-primary">
          <ReceiptText size={22} />
        </span>
        <h3 className="text-lg font-bold text-ink">Payment Successful</h3>
      </div>

      <div className="border-t border-mute pt-md">
        <p className="mb-sm text-xs font-bold uppercase tracking-wide text-body-soft">Payment Details</p>
        <Row k="Invoice Number" v={data.invoiceNumber} mono />
        <Row k="Order Time" v={dateTime(data.orderTimeISO)} />
        <Row k="Payment Method" v={data.method} />
        <Row
          k="Payment Status"
          v={<span className="rounded-sm bg-success-soft px-xs py-xxs text-xs font-semibold text-success-ink">Successful</span>}
        />
        <Row k="Amount" v={inr(data.total)} />
      </div>

      <div className="mt-md border-t border-mute pt-md">
        <p className="mb-sm text-xs font-bold uppercase tracking-wide text-body-soft">Product Details</p>
        <Row k={lineLabel} v={inr(data.subtotal)} />
        <Row k="GST (18%)" v={inr(data.tax)} />
        <Row k="Total Amount" v={inr(data.total)} strong />
      </div>

      {data.firstChargeISO && (
        <p className="mt-md text-center text-xs text-body-soft">
          Billed after your 7-day free trial — first charge on <strong className="text-body">{dateOnly(data.firstChargeISO)}</strong>.
        </p>
      )}

      <button onClick={downloadPdf} disabled={downloading} className="btn-outline mt-lg w-full gap-sm">
        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Download PDF Receipt
      </button>
    </div>
  );
}

function Row({ k, v, strong, mono }: { k: string; v: React.ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-md py-1">
      <span className={`text-sm ${strong ? 'font-bold text-ink' : 'text-body'}`}>{k}</span>
      <span className={`text-sm text-right ${strong ? 'font-bold text-ink' : 'font-semibold text-ink'} ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
    </div>
  );
}
