<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

// The one shared piece of "report generation" every export endpoint in the
// app streams its CSV through — kept intentionally tiny (headers + rows,
// nothing else) rather than pulling in a PDF/reporting library for what is,
// so far, always "a table of records with correct totals/dates/labels" per
// the defense checklist's Reports criterion. StreamedResponse (not
// building the whole string in memory first) is what lets a large export
// (e.g. a long-running venue's full booking history) not spike memory.
class CsvExport
{
    /**
     * @param  string[]  $headers
     * @param  iterable<int, array<int, string|int|float|null>>  $rows
     */
    public static function download(string $filename, array $headers, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headers, $rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $headers);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }
}
