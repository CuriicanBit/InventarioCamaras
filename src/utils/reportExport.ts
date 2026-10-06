import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportFilterItem {
  label: string;
  value: string;
}

export interface ReportKpiSummaryItem {
  label: string;
  value: string | number;
}

export interface ExportReportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  appliedFilters?: ReportFilterItem[];
  summaryKpis?: ReportKpiSummaryItem[];
  orientation?: 'portrait' | 'landscape';
}

/**
 * Export generic report data to Excel (.xlsx) using SheetJS
 */
export function exportReportToExcel(options: ExportReportOptions): void {
  const { title, subtitle, filename, headers, rows, appliedFilters, summaryKpis } = options;

  // Build rows array of arrays for sheet
  const sheetData: any[][] = [];

  // Header banner inside sheet
  sheetData.push([title.toUpperCase()]);
  sheetData.push([subtitle || 'CCTV InfraRegistro · Reporte de Planta Física']);
  sheetData.push([`Fecha de Generación: ${new Date().toLocaleString()}`]);

  // Filters row
  if (appliedFilters && appliedFilters.length > 0) {
    const filtersStr = appliedFilters
      .map(f => `${f.label}: ${f.value}`)
      .join(' | ');
    sheetData.push([`Filtros Aplicados: ${filtersStr}`]);
  }

  // Summary KPIs row
  if (summaryKpis && summaryKpis.length > 0) {
    const kpisStr = summaryKpis
      .map(k => `${k.label}: ${k.value}`)
      .join(' | ');
    sheetData.push([`Resumen de Totales: ${kpisStr}`]);
  }

  // Empty separator row
  sheetData.push([]);

  // Column headers row
  sheetData.push(headers);

  // Data rows
  rows.forEach(row => {
    sheetData.push(row.map(cell => (cell === null || cell === undefined ? '' : cell)));
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Calculate auto column widths
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length;
    rows.forEach(r => {
      const val = r[colIdx];
      const strVal = val === null || val === undefined ? '' : String(val);
      if (strVal.length > maxLen) {
        maxLen = strVal.length;
      }
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
  });

  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  const safeSheetName = title.slice(0, 30).replace(/[:\\\/\?\*\[\]]/g, ' ');
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName || 'Reporte');

  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, cleanFilename);
}

/**
 * Export generic report data to PDF using jsPDF + jspdf-autotable
 */
export function exportReportToPdf(options: ExportReportOptions): void {
  const {
    title,
    subtitle = 'CCTV InfraRegistro · Infraestructura Física de Telecomunicaciones',
    filename,
    headers,
    rows,
    appliedFilters,
    summaryKpis,
    orientation = 'landscape',
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top Accent Brand Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Blue decorative strip
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 24, pageWidth, 2, 'F');

  // Title & Brand in Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(subtitle, 14, 17);

  // Timestamp on top right
  const nowStr = new Date().toLocaleString();
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Generado: ${nowStr}`, pageWidth - 14, 11, { align: 'right' });
  doc.text('Norma TIA-606-C', pageWidth - 14, 17, { align: 'right' });

  let currentY = 32;

  // Filter Box / Badge Info
  if (appliedFilters && appliedFilters.length > 0) {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(14, currentY, pageWidth - 28, 8, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('FILTROS ACTIVOS:', 17, currentY + 5.2);

    const filterTexts = appliedFilters.map(f => `${f.label}: ${f.value}`).join('  |  ');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(filterTexts, 46, currentY + 5.2);

    currentY += 12;
  }

  // Summary KPIs Bar
  if (summaryKpis && summaryKpis.length > 0) {
    const kpiCount = summaryKpis.length;
    const boxGap = 3;
    const totalAvailWidth = pageWidth - 28 - (kpiCount - 1) * boxGap;
    const boxWidth = totalAvailWidth / kpiCount;

    summaryKpis.forEach((kpi, idx) => {
      const bx = 14 + idx * (boxWidth + boxGap);
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.roundedRect(bx, currentY, boxWidth, 12, 1, 1, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(kpi.label.toUpperCase(), bx + 3, currentY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(String(kpi.value), bx + 3, currentY + 10);
    });

    currentY += 16;
  }

  // Data Table with autoTable
  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows.map(r => r.map(c => (c === null || c === undefined ? '-' : String(c)))),
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42], // slate-900
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59], // slate-800
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    margin: { left: 14, right: 14, top: 28, bottom: 14 },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
    didDrawPage: (data) => {
      // Running Footer on each page
      const totalPages = (doc as any).internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Página ${data.pageNumber} de ${totalPages} · Sistema CCTV InfraRegistro · Documento Confidencial`,
        14,
        pageHeight - 6
      );
      doc.text(
        `Registros listados: ${rows.length}`,
        pageWidth - 14,
        pageHeight - 6,
        { align: 'right' }
      );
    },
  });

  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  doc.save(cleanFilename);
}
