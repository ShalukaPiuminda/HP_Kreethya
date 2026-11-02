<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureDeveloper
{
    public function handle(Request $request, Closure $next)
    {
        if (!$request->user()?->isDeveloper()) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden. Developer access is required.',
            ], 403);
        }

        return $next($request);
    }
}
