<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;

class AuditLogController extends Controller
{
    public function index()
    {
        return AuditLog::with('actor:id,name,email')
            ->orderByDesc('created_at')
            ->paginate(20);
    }
}
