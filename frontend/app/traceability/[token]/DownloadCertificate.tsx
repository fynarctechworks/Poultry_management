'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

interface Props {
  record: {
    qr_token: string;
    supplier_name: string;
    breed_name: string;
    placement_date: string;
    harvest_date: string | null;
    total_vaccinations: number | null;
    health_incidents_count: number | null;
    withdrawal_cleared: boolean;
    buyer_name: string | null;
  };
}

export function DownloadCertificate({ record }: Props) {
  async function generate() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setTextColor(41, 37, 36); // colors.primary (ink) #292524 — retired Kraken purple
    doc.text('PoultryOS', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(16, 17, 20);
    doc.text('Farm-to-Plate Traceability Certificate', pageWidth / 2, 28, { align: 'center' });

    if (record.withdrawal_cleared) {
      doc.setFontSize(10);
      doc.setTextColor(2, 107, 63);
      doc.text('✓ Antibiotic withdrawal period cleared', pageWidth / 2, 36, { align: 'center' });
    }

    autoTable(doc, {
      startY: 46,
      theme: 'grid',
      head: [['Field', 'Value']],
      headStyles: { fillColor: [41, 37, 36], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: [16, 17, 20] },
      styles: { fontSize: 11, cellPadding: 4 },
      body: [
        ['Breed', record.breed_name],
        ['Supplier', record.supplier_name],
        ['Placed on', new Date(record.placement_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
        ['Harvested on', record.harvest_date ? new Date(record.harvest_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
        ['Vaccinations administered', String(record.total_vaccinations ?? 0)],
        ['Health incidents', String(record.health_incidents_count ?? 0)],
        ['Buyer', record.buyer_name ?? '—'],
        ['Withdrawal cleared', record.withdrawal_cleared ? 'Yes' : 'No'],
      ],
    });

    const qrDataUrl = await QRCode.toDataURL(
      `${typeof window !== 'undefined' ? window.location.origin : ''}/traceability/${record.qr_token}`,
      { width: 256, margin: 1 }
    );
    const finalY = (doc as any).lastAutoTable.finalY ?? 100;
    doc.addImage(qrDataUrl, 'PNG', pageWidth / 2 - 25, finalY + 10, 50, 50);

    doc.setFontSize(9);
    doc.setTextColor(104, 107, 130);
    doc.text(`Token: ${record.qr_token}`, pageWidth / 2, finalY + 68, { align: 'center' });
    doc.text('Powered by PoultryOS · Source of truth for Indian poultry farms', pageWidth / 2, finalY + 75, { align: 'center' });

    doc.save(`traceability-${record.qr_token.slice(0, 8)}.pdf`);
  }

  return (
    <button onClick={generate} className="btn-outline w-full mt-md">
      Download as PDF
    </button>
  );
}
