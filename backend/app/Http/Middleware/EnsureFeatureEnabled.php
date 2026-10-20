<?php

namespace App\Http\Middleware;

use App\Support\Features;
use Closure;
use Illuminate\Http\Request;

/**
 * Usage: ->middleware('feature:sms')
 * Blocks everyone (including Super Admin) until the developer enables the feature.
 */
class EnsureFeatureEnabled
{
    public function handle(Request $request, Closure $next, string $feature)
    {
        if ($request->user()?->isDeveloper() || Features::enabled($feature)) {
            return $next($request);
        }

        $label = Features::ALL[$feature] ?? $feature;

        return response()->json([
            'success' => false,
            'message' => "{$label} is a premium feature that is not activated for this system. Please contact the system provider to enable it.",
            'feature_locked' => true,
            'feature' => $feature,
        ], 403);
    }
}
