<?php
/**
 * VAVA Sports Academy - Reports Export Engine (Attendance PDF & Excel)
 * 
 * Production Architectural Guarantees:
 * - Single Source of Truth: Reuses getReportData() from server/reports.php
 * - 100% Dynamic MySQL data (zero sample/hardcoded rows)
 * - Strict role-based authorization (Students blocked, Coaches restricted to assigned batches/attendance)
 * - Full Filter Responsiveness (Coach, Batch, Date From, Date To, Status)
 * - Not limited by UI pagination (exports entire filtered dataset)
 * - Zero-result safety (returns structured JSON notice, blocks corrupted/empty file downloads)
 * - Professional PDF via Dompdf with repeating headers & dynamic page numbering
 * - Professional Excel (.xlsx) with Attendance Data + Summary sheets, frozen headers, autofilters & styling
 */

require_once __DIR__ . '/../vendor/dompdf/autoload.inc.php';

use Dompdf\Dompdf;
use Dompdf\Options;

/**
 * Handle Attendance Report Export Request
 */
function handleAttendanceExport($pdo, $auth, $filters, $format = 'pdf') {
    // 1. Authorization Guard
    $role = strtolower(trim($auth['role'] ?? ''));
    if ($role === 'student') {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'error'   => 'Access denied. Reports export is restricted to coaches and administrators.'
        ]);
        exit;
    }

    // 2. Fetch Filtered Dataset from Single Source of Truth
    $reportData = getReportData($pdo, 'attendance_report', $filters, $auth);

    // 3. Zero-Result Handling
    if (!empty($reportData['empty']) || empty($reportData['table_rows'])) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'empty'   => true,
            'message' => 'No attendance data available to export for the selected filters.'
        ]);
        exit;
    }

    // 4. Determine Dynamic Clean Filename
    $startDate = !empty($filters['start_date']) ? preg_replace('/[^0-9\-]/', '', $filters['start_date']) : '';
    $endDate = !empty($filters['end_date']) ? preg_replace('/[^0-9\-]/', '', $filters['end_date']) : '';

    $dateSegment = date('Y-m-d');
    if ($startDate && $endDate) {
        $dateSegment = "{$startDate}_to_{$endDate}";
    } elseif ($startDate) {
        $dateSegment = "from_{$startDate}";
    } elseif ($endDate) {
        $dateSegment = "until_{$endDate}";
    }

    $ext = ($format === 'xlsx') ? 'xlsx' : 'pdf';
    $filename = "VAVA_Attendance_Report_{$dateSegment}.{$ext}";

    // 5. Generate and Stream
    if ($format === 'xlsx') {
        $xlsxBytes = generateAttendanceXlsx($reportData, $filters);
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($xlsxBytes));
        header('Cache-Control: private, max-age=0, must-revalidate');
        header('Pragma: public');
        echo $xlsxBytes;
        exit;
    } else {
        $pdfBytes = generateAttendancePdf($reportData, $filters);
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($pdfBytes));
        header('Cache-Control: private, max-age=0, must-revalidate');
        header('Pragma: public');
        echo $pdfBytes;
        exit;
    }
}

/**
 * Generate Professional Attendance PDF via Dompdf
 */
function generateAttendancePdf($reportData, $filters = []) {
    $genDateTime = ($reportData['generated_date'] ?? date('d M Y')) . ' at ' . ($reportData['generated_time'] ?? date('h:i A'));

    // Applied Filters formatting
    $filtersHtml = '';
    if (!empty($reportData['filters_applied'])) {
        $filterParts = [];
        foreach ($reportData['filters_applied'] as $fa) {
            $filterParts[] = '<span><strong>' . htmlspecialchars($fa['label']) . ':</strong> ' . htmlspecialchars($fa['value']) . '</span>';
        }
        $filtersHtml = implode(' &nbsp;|&nbsp; ', $filterParts);
    } else {
        $filtersHtml = '<span><strong>Filters:</strong> All Available Records (No specific filter applied)</span>';
    }

    // KPI Metrics formatting
    $metricsHtml = '';
    $metrics = $reportData['summary_metrics'] ?? [];
    foreach ($metrics as $m) {
        $val = htmlspecialchars((string)($m['value'] ?? '0'));
        $lbl = htmlspecialchars(strtoupper($m['label'] ?? ''));
        $sub = htmlspecialchars($m['subtext'] ?? '');
        $metricsHtml .= '
        <td style="padding: 7px 10px; background: #F8FAFC; border: 1px solid #E2E8F0; text-align: center; width: 20%;">
            <div style="font-size: 8px; color: #64748B; font-weight: bold; letter-spacing: 0.5px;">' . $lbl . '</div>
            <div style="font-size: 15px; font-weight: bold; color: #0F172A; margin-top: 2px;">' . $val . '</div>
            <div style="font-size: 7.5px; color: #94A3B8; margin-top: 1px;">' . $sub . '</div>
        </td>';
    }

    // Attendance Rows formatting
    $rowsHtml = '';
    $idx = 0;
    foreach ($reportData['table_rows'] as $r) {
        $idx++;
        $bg = ($idx % 2 === 0) ? '#F8FAFC' : '#FFFFFF';
        $st = strtolower($r[4] ?? '');
        $stBadge = ($st === 'present')
            ? '<span style="display:inline-block; padding: 2px 7px; font-size: 8.5px; font-weight: bold; color: #15803D; background: #DCFCE7; border-radius: 3px;">Present</span>'
            : '<span style="display:inline-block; padding: 2px 7px; font-size: 8.5px; font-weight: bold; color: #B91C1C; background: #FEE2E2; border-radius: 3px;">Absent</span>';

        $rowsHtml .= '
        <tr style="background: ' . $bg . ';">
            <td style="padding: 5.5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 8.5px; color: #0F172A; white-space: nowrap;">' . htmlspecialchars($r[0]) . '</td>
            <td style="padding: 5.5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 8.5px; color: #334155;">' . htmlspecialchars($r[1]) . '</td>
            <td style="padding: 5.5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 8.5px; font-weight: bold; color: #0F172A;">' . htmlspecialchars($r[2]) . '</td>
            <td style="padding: 5.5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 8.5px; color: #475569;">' . htmlspecialchars($r[3]) . '</td>
            <td style="padding: 5.5px 8px; border-bottom: 1px solid #E2E8F0; text-align: center;">' . $stBadge . '</td>
        </tr>';
    }

    $html = '<!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <title>VAVA Sports Academy - Attendance Report</title>
    <style>
        @page {
            margin: 18mm 14mm 18mm 14mm;
        }
        body {
            font-family: Helvetica, Arial, sans-serif;
            color: #1E293B;
            font-size: 9px;
            line-height: 1.35;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        thead {
            display: table-header-group;
        }
        tr {
            page-break-inside: avoid;
        }
        .header-table {
            margin-bottom: 12px;
            border-bottom: 2px solid #C9A227;
            padding-bottom: 8px;
        }
        .brand-title {
            font-size: 17px;
            font-weight: bold;
            color: #0F172A;
            letter-spacing: 0.5px;
        }
        .report-title {
            font-size: 12px;
            font-weight: bold;
            color: #C9A227;
            margin-top: 1px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .meta-text {
            font-size: 8.5px;
            color: #64748B;
            text-align: right;
        }
        .filter-box {
            background: #F1F5F9;
            border-left: 3px solid #C9A227;
            padding: 5px 9px;
            font-size: 8px;
            color: #334155;
            margin-bottom: 12px;
            border-radius: 0 4px 4px 0;
        }
        .metrics-table {
            margin-bottom: 14px;
        }
        .data-table th {
            background: #0F172A;
            color: #F8FAFC;
            padding: 6.5px 8px;
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
            border: 1px solid #0F172A;
        }
        .data-table th.center {
            text-align: center;
        }
    </style>
    </head>
    <body>

    <table class="header-table">
        <tr>
            <td style="vertical-align: middle;">
                <div class="brand-title">VAVA SPORTS ACADEMY</div>
                <div class="report-title">ATTENDANCE REPORT</div>
            </td>
            <td style="vertical-align: middle; text-align: right;">
                <div class="meta-text"><strong>Generated:</strong> ' . htmlspecialchars($genDateTime) . '</div>
                <div class="meta-text"><strong>System:</strong> Official Attendance Audit Report</div>
            </td>
        </tr>
    </table>

    <div class="filter-box">
        <strong>ACTIVE FILTERS:</strong> &nbsp;' . $filtersHtml . '
    </div>

    <table class="metrics-table">
        <tr>' . $metricsHtml . '</tr>
    </table>

    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 14%;">Date</th>
                <th style="width: 22%;">Batch</th>
                <th style="width: 28%;">Student Name</th>
                <th style="width: 23%;">Coach</th>
                <th style="width: 13%;" class="center">Status</th>
            </tr>
        </thead>
        <tbody>
            ' . $rowsHtml . '
        </tbody>
    </table>

    </body>
    </html>';

    $options = new Options();
    $options->set('isRemoteEnabled', true);
    $options->set('defaultFont', 'Helvetica');

    $dompdf = new Dompdf($options);
    $dompdf->loadHtml($html);
    $dompdf->setPaper('A4', 'portrait');
    $dompdf->render();

    // Subtle professional footer with dynamic Page X of Y
    $canvas = $dompdf->getCanvas();
    $canvas->page_text(40, 810, "VAVA Sports Academy • Attendance Audit Report", null, 7.5, [0.45, 0.5, 0.55]);
    $canvas->page_text(500, 810, "Page {PAGE_NUM} of {PAGE_COUNT}", null, 7.5, [0.45, 0.5, 0.55]);

    return $dompdf->output();
}

/**
 * Generate Professional Excel (.xlsx) workbook with Sheet 1 (Attendance Data) & Sheet 2 (Summary)
 */
function generateAttendanceXlsx($reportData, $filters = []) {
    $writer = new AttendanceXlsxPackage();

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 1: Attendance Data
    // ─────────────────────────────────────────────────────────────────────────
    $sheet1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
    $sheet1 .= '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' . "\n";
    $sheet1 .= '  <sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' . "\n";
    $sheet1 .= '  <cols>' . "\n";
    $sheet1 .= '    <col min="1" max="1" width="16" customWidth="1"/>' . "\n";
    $sheet1 .= '    <col min="2" max="2" width="24" customWidth="1"/>' . "\n";
    $sheet1 .= '    <col min="3" max="3" width="30" customWidth="1"/>' . "\n";
    $sheet1 .= '    <col min="4" max="4" width="26" customWidth="1"/>' . "\n";
    $sheet1 .= '    <col min="5" max="5" width="16" customWidth="1"/>' . "\n";
    $sheet1 .= '  </cols>' . "\n";
    $sheet1 .= '  <sheetData>' . "\n";

    // Header Row
    $sheet1 .= '    <row r="1" ht="26" customHeight="1">' . "\n";
    $sheet1 .= '      <c r="A1" t="inlineStr" s="1"><is><t>Date</t></is></c>' . "\n";
    $sheet1 .= '      <c r="B1" t="inlineStr" s="1"><is><t>Batch</t></is></c>' . "\n";
    $sheet1 .= '      <c r="C1" t="inlineStr" s="1"><is><t>Student Name</t></is></c>' . "\n";
    $sheet1 .= '      <c r="D1" t="inlineStr" s="1"><is><t>Coach</t></is></c>' . "\n";
    $sheet1 .= '      <c r="E1" t="inlineStr" s="1"><is><t>Status</t></is></c>' . "\n";
    $sheet1 .= '    </row>' . "\n";

    $rowNum = 1;
    foreach ($reportData['table_rows'] as $r) {
        $rowNum++;
        $isZebra = ($rowNum % 2 === 1);
        $dataStyle = $isZebra ? 3 : 2;

        $st = strtolower($r[4] ?? '');
        $stStyle = ($st === 'present') ? 4 : 5;

        $sheet1 .= '    <row r="' . $rowNum . '" ht="20" customHeight="1">' . "\n";
        $sheet1 .= '      <c r="A' . $rowNum . '" t="inlineStr" s="' . $dataStyle . '"><is><t>' . AttendanceXlsxPackage::xmlEscape($r[0] ?? '') . '</t></is></c>' . "\n";
        $sheet1 .= '      <c r="B' . $rowNum . '" t="inlineStr" s="' . $dataStyle . '"><is><t>' . AttendanceXlsxPackage::xmlEscape($r[1] ?? '') . '</t></is></c>' . "\n";
        $sheet1 .= '      <c r="C' . $rowNum . '" t="inlineStr" s="' . $dataStyle . '"><is><t>' . AttendanceXlsxPackage::xmlEscape($r[2] ?? '') . '</t></is></c>' . "\n";
        $sheet1 .= '      <c r="D' . $rowNum . '" t="inlineStr" s="' . $dataStyle . '"><is><t>' . AttendanceXlsxPackage::xmlEscape($r[3] ?? '') . '</t></is></c>' . "\n";
        $sheet1 .= '      <c r="E' . $rowNum . '" t="inlineStr" s="' . $stStyle . '"><is><t>' . AttendanceXlsxPackage::xmlEscape($r[4] ?? '') . '</t></is></c>' . "\n";
        $sheet1 .= '    </row>' . "\n";
    }

    $sheet1 .= '  </sheetData>' . "\n";
    $sheet1 .= '  <autoFilter ref="A1:E' . $rowNum . '"/>' . "\n";
    $sheet1 .= '</worksheet>';

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 2: Summary
    // ─────────────────────────────────────────────────────────────────────────
    $genDateTime = ($reportData['generated_date'] ?? date('d M Y')) . ' at ' . ($reportData['generated_time'] ?? date('h:i A'));
    $period = $reportData['period'] ?? 'All Records';

    $sheet2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
    $sheet2 .= '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' . "\n";
    $sheet2 .= '  <cols>' . "\n";
    $sheet2 .= '    <col min="1" max="1" width="30" customWidth="1"/>' . "\n";
    $sheet2 .= '    <col min="2" max="2" width="45" customWidth="1"/>' . "\n";
    $sheet2 .= '  </cols>' . "\n";
    $sheet2 .= '  <sheetData>' . "\n";

    // Title Section
    $sheet2 .= '    <row r="1" ht="28" customHeight="1">' . "\n";
    $sheet2 .= '      <c r="A1" t="inlineStr" s="6"><is><t>VAVA SPORTS ACADEMY</t></is></c>' . "\n";
    $sheet2 .= '    </row>' . "\n";
    $sheet2 .= '    <row r="2">' . "\n";
    $sheet2 .= '      <c r="A2" t="inlineStr" s="0"><is><t>Report: Attendance Audit Report</t></is></c>' . "\n";
    $sheet2 .= '    </row>' . "\n";
    $sheet2 .= '    <row r="3">' . "\n";
    $sheet2 .= '      <c r="A3" t="inlineStr" s="0"><is><t>Generated: ' . AttendanceXlsxPackage::xmlEscape($genDateTime) . '</t></is></c>' . "\n";
    $sheet2 .= '    </row>' . "\n";
    $sheet2 .= '    <row r="4">' . "\n";
    $sheet2 .= '      <c r="A4" t="inlineStr" s="0"><is><t>Reporting Period: ' . AttendanceXlsxPackage::xmlEscape($period) . '</t></is></c>' . "\n";
    $sheet2 .= '    </row>' . "\n";

    // Blank row 5
    $sheet2 .= '    <row r="5"/>' . "\n";

    // Applied Filters Section
    $sheet2 .= '    <row r="6" ht="22" customHeight="1">' . "\n";
    $sheet2 .= '      <c r="A6" t="inlineStr" s="7"><is><t>Applied Filter Parameter</t></is></c>' . "\n";
    $sheet2 .= '      <c r="B6" t="inlineStr" s="7"><is><t>Selected Value</t></is></c>' . "\n";
    $sheet2 .= '    </row>' . "\n";

    $curRow = 6;
    if (!empty($reportData['filters_applied'])) {
        foreach ($reportData['filters_applied'] as $fa) {
            $curRow++;
            $sheet2 .= '    <row r="' . $curRow . '">' . "\n";
            $sheet2 .= '      <c r="A' . $curRow . '" t="inlineStr" s="2"><is><t>' . AttendanceXlsxPackage::xmlEscape($fa['label']) . '</t></is></c>' . "\n";
            $sheet2 .= '      <c r="B' . $curRow . '" t="inlineStr" s="2"><is><t>' . AttendanceXlsxPackage::xmlEscape($fa['value']) . '</t></is></c>' . "\n";
            $sheet2 .= '    </row>' . "\n";
        }
    } else {
        $curRow++;
        $sheet2 .= '    <row r="' . $curRow . '">' . "\n";
        $sheet2 .= '      <c r="A' . $curRow . '" t="inlineStr" s="2"><is><t>All Filters</t></is></c>' . "\n";
        $sheet2 .= '      <c r="B' . $curRow . '" t="inlineStr" s="2"><is><t>Unfiltered (All Records)</t></is></c>' . "\n";
        $sheet2 .= '    </row>' . "\n";
    }

    // Blank separator
    $curRow++;
    $sheet2 .= '    <row r="' . $curRow . '"/>' . "\n";

    // Summary Metrics Section
    $curRow++;
    $sheet2 .= '    <row r="' . $curRow . '" ht="22" customHeight="1">' . "\n";
    $sheet2 .= '      <c r="A' . $curRow . '" t="inlineStr" s="7"><is><t>Summary Metric</t></is></c>' . "\n";
    $sheet2 .= '      <c r="B' . $curRow . '" t="inlineStr" s="7"><is><t>Value</t></is></c>' . "\n";
    $sheet2 .= '    </row>' . "\n";

    foreach ($reportData['summary_metrics'] as $sm) {
        $curRow++;
        $sheet2 .= '    <row r="' . $curRow . '">' . "\n";
        $sheet2 .= '      <c r="A' . $curRow . '" t="inlineStr" s="2"><is><t>' . AttendanceXlsxPackage::xmlEscape($sm['label']) . '</t></is></c>' . "\n";
        $sheet2 .= '      <c r="B' . $curRow . '" t="inlineStr" s="2"><is><t>' . AttendanceXlsxPackage::xmlEscape((string)$sm['value']) . '</t></is></c>' . "\n";
        $sheet2 .= '    </row>' . "\n";
    }

    $sheet2 .= '  </sheetData>' . "\n";
    $sheet2 .= '</worksheet>';

    $writer->addSheet('Attendance Data', $sheet1);
    $writer->addSheet('Summary', $sheet2);

    return $writer->build();
}

/**
 * Pure-PHP OpenXML XLSX Package Builder (No external extensions required)
 */
class AttendanceXlsxPackage {
    private $sheets = [];

    public function addSheet($name, $xmlContent) {
        $this->sheets[$name] = $xmlContent;
    }

    public static function xmlEscape($str) {
        return htmlspecialchars((string)$str, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    public function build() {
        $files = [];

        // 1. [Content_Types].xml
        $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
        $contentTypes .= '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' . "\n";
        $contentTypes .= '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' . "\n";
        $contentTypes .= '  <Default Extension="xml" ContentType="application/xml"/>' . "\n";
        $contentTypes .= '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' . "\n";
        $contentTypes .= '  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' . "\n";
        $idx = 1;
        foreach ($this->sheets as $name => $content) {
            $contentTypes .= '  <Override PartName="/xl/worksheets/sheet' . $idx . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' . "\n";
            $idx++;
        }
        $contentTypes .= '</Types>';
        $files['[Content_Types].xml'] = $contentTypes;

        // 2. _rels/.rels
        $rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
        $rootRels .= '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . "\n";
        $rootRels .= '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' . "\n";
        $rootRels .= '</Relationships>';
        $files['_rels/.rels'] = $rootRels;

        // 3. xl/_rels/workbook.xml.rels
        $wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
        $wbRels .= '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . "\n";
        $idx = 1;
        foreach ($this->sheets as $name => $content) {
            $wbRels .= '  <Relationship Id="rId' . $idx . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $idx . '.xml"/>' . "\n";
            $idx++;
        }
        $wbRels .= '  <Relationship Id="rId' . $idx . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' . "\n";
        $wbRels .= '</Relationships>';
        $files['xl/_rels/workbook.xml.rels'] = $wbRels;

        // 4. xl/workbook.xml
        $wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
        $wb .= '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' . "\n";
        $wb .= '  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20480" windowHeight="10240"/></bookViews>' . "\n";
        $wb .= '  <sheets>' . "\n";
        $idx = 1;
        foreach ($this->sheets as $name => $content) {
            $wb .= '    <sheet name="' . self::xmlEscape($name) . '" sheetId="' . $idx . '" r:id="rId' . $idx . '"/>' . "\n";
            $idx++;
        }
        $wb .= '  </sheets>' . "\n";
        $wb .= '</workbook>';
        $files['xl/workbook.xml'] = $wb;

        // 5. xl/styles.xml
        $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
        $styles .= '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' . "\n";
        $styles .= '  <fonts count="6">' . "\n";
        $styles .= '    <font><sz val="11"/><name val="Calibri"/><color theme="1"/></font>' . "\n"; // 0: Normal
        $styles .= '    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>' . "\n"; // 1: Header white bold
        $styles .= '    <font><b/><sz val="14"/><name val="Calibri"/><color rgb="FF0F172A"/></font>' . "\n"; // 2: Title 14pt bold
        $styles .= '    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF15803D"/></font>' . "\n"; // 3: Present green bold
        $styles .= '    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFB91C1C"/></font>' . "\n"; // 4: Absent red bold
        $styles .= '    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF0F172A"/></font>' . "\n"; // 5: Subheader dark bold
        $styles .= '  </fonts>' . "\n";
        $styles .= '  <fills count="7">' . "\n";
        $styles .= '    <fill><patternFill patternType="none"/></fill>' . "\n"; // 0
        $styles .= '    <fill><patternFill patternType="gray125"/></fill>' . "\n"; // 1
        $styles .= '    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill>' . "\n"; // 2: Dark Blue Header
        $styles .= '    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>' . "\n"; // 3: Zebra Gray
        $styles .= '    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>' . "\n"; // 4: Soft Green
        $styles .= '    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill>' . "\n"; // 5: Soft Red
        $styles .= '    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill>' . "\n"; // 6: Gray Accent
        $styles .= '  </fills>' . "\n";
        $styles .= '  <borders count="2">' . "\n";
        $styles .= '    <border><left/><right/><top/><bottom/><diagonal/></border>' . "\n"; // 0: None
        $styles .= '    <border>' . "\n"; // 1: Thin gray border
        $styles .= '      <left style="thin"><color rgb="FFE2E8F0"/></left>' . "\n";
        $styles .= '      <right style="thin"><color rgb="FFE2E8F0"/></right>' . "\n";
        $styles .= '      <top style="thin"><color rgb="FFE2E8F0"/></top>' . "\n";
        $styles .= '      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>' . "\n";
        $styles .= '    </border>' . "\n";
        $styles .= '  </borders>' . "\n";
        $styles .= '  <cellStyleXfs count="1">' . "\n";
        $styles .= '    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' . "\n";
        $styles .= '  </cellStyleXfs>' . "\n";
        $styles .= '  <cellXfs count="8">' . "\n";
        $styles .= '    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' . "\n"; // 0: Normal
        $styles .= '    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' . "\n"; // 1: Table Header (Dark Blue)
        $styles .= '    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' . "\n"; // 2: Data Regular
        $styles .= '    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' . "\n"; // 3: Data Zebra Gray
        $styles .= '    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' . "\n"; // 4: Present (Green)
        $styles .= '    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' . "\n"; // 5: Absent (Red)
        $styles .= '    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' . "\n"; // 6: Title
        $styles .= '    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' . "\n"; // 7: Summary Subheader
        $styles .= '  </cellXfs>' . "\n";
        $styles .= '</styleSheet>';
        $files['xl/styles.xml'] = $styles;

        // 6. Worksheets
        $idx = 1;
        foreach ($this->sheets as $name => $content) {
            $files['xl/worksheets/sheet' . $idx . '.xml'] = $content;
            $idx++;
        }

        return self::createZipArchive($files);
    }

    /**
     * Pure-PHP Zip packager using gzdeflate (works anywhere PHP with zlib runs)
     */
    public static function createZipArchive($files) {
        $zipData = '';
        $centralDir = '';
        $offset = 0;

        foreach ($files as $filename => $data) {
            $filename = str_replace('\\', '/', $filename);
            $uncLen = strlen($data);
            $crc = crc32($data);

            $gz = gzdeflate($data);
            $cLen = strlen($gz);

            // Local File Header (PK\x03\x04)
            $localHeader = pack(
                'VvvvvvVVVvv',
                0x04034b50,        // signature
                20,                // version needed (2.0)
                0,                 // general purpose bit flag
                8,                 // compression method (8 = deflate)
                0,                 // last mod file time
                0,                 // last mod file date
                $crc,              // crc-32
                $cLen,             // compressed size
                $uncLen,           // uncompressed size
                strlen($filename), // file name length
                0                  // extra field length
            );

            $zipData .= $localHeader . $filename . $gz;

            // Central Directory Entry (PK\x01\x02)
            $cdEntry = pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,        // signature
                20,                // version made by
                20,                // version needed to extract
                0,                 // general purpose bit flag
                8,                 // compression method
                0,                 // last mod file time
                0,                 // last mod file date
                $crc,              // crc-32
                $cLen,             // compressed size
                $uncLen,           // uncompressed size
                strlen($filename), // file name length
                0,                 // extra field length
                0,                 // file comment length
                0,                 // disk number start
                0,                 // internal file attributes
                32,                // external file attributes
                $offset            // relative offset of local header
            );
            $centralDir .= $cdEntry . $filename;

            $offset = strlen($zipData);
        }

        // End of Central Directory Record (PK\x05\x06)
        $cdLen = strlen($centralDir);
        $eocd = pack(
            'VvvvvVVv',
            0x06054b50,    // signature
            0,             // disk number
            0,             // disk where central dir starts
            count($files), // number of central dir records on this disk
            count($files), // total number of central dir records
            $cdLen,        // size of central dir
            $offset,       // offset of central dir with respect to starting disk
            0              // zip comment length
        );

        return $zipData . $centralDir . $eocd;
    }
}
