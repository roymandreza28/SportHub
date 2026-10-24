<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d\TH:i'],
            'to' => ['nullable', 'date_format:Y-m-d\TH:i'],
        ]);

        $query = AuditLog::with('actor:id,name,email');

        if (! empty($data['from'])) {
            $query->where('created_at', '>=', Carbon::parse($data['from'])->toDateTimeString());
        }

        if (! empty($data['to'])) {
            $query->where('created_at', '<=', Carbon::parse($data['to'])->toDateTimeString());
        }

        return $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(20);
    }
}
