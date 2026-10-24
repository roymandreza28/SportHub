<?php

namespace App\Http\Middleware;

use App\Models\AuditLog;
use Closure;
use Illuminate\Http\Request;

class AuditLogMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $user = $request->user();

        if (! $user || $request->is('api/logout')) {
            return $response;
        }

        $path = trim((string) $request->path(), '/');
        $action = $path === '' ? 'request.unknown' : 'request.'.strtolower($request->method()).'.'.str_replace('/', '.', $path);

        AuditLog::record($user, $action, null, [
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return $response;
    }
}
