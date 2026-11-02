<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\RolePermission;

class CheckRolePermission
{
    /**
     * Map HTTP methods to permission actions.
     */
    private const METHOD_ACTION_MAP = [
        'GET'    => 'can_read',
        'HEAD'   => 'can_read',
        'POST'   => 'can_create',
        'PUT'    => 'can_update',
        'PATCH'  => 'can_update',
        'DELETE' => 'can_delete',
    ];

    /**
     * Handle an incoming request.
     *
     * Checks if the authenticated user has the required permission
     * for the given module. The action (can_read/can_create/can_update/can_delete)
     * is automatically determined from the HTTP method unless explicitly overridden.
     *
     * Usage: ->middleware('role.permission:module')
     *        ->middleware('role.permission:module,can_read')
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @param  string  $module
     * @param  string|null  $action  Optional override. Defaults to method-based mapping.
     * @return mixed
     */
    public function handle(Request $request, Closure $next, string $module, ?string $action = null)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.'
            ], 401);
        }

        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        $action ??= self::METHOD_ACTION_MAP[$request->method()] ?? 'can_read';

        $permission = RolePermission::query()
            ->where('role_id', $user->role_id)
            ->where('module', $module)
            ->first();

        if (!$permission || !$permission->$action) {
            $actionLabel = match($action) {
                'can_read' => 'view',
                'can_create' => 'create',
                'can_update' => 'update',
                'can_delete' => 'delete',
                default => $action,
            };

            return response()->json([
                'success' => false,
                'message' => "Forbidden. You do not have permission to {$actionLabel} {$module}.",
                'required_permission' => "{$module}.{$action}"
            ], 403);
        }

        return $next($request);
    }
}
