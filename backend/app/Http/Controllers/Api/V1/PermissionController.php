<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PermissionController extends BaseController
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'role_id' => ['required', 'exists:roles,id'],
        ]);

        $permissions = RolePermission::where('role_id', $validated['role_id'])
            ->orderBy('module')
            ->get();

        return $this->successResponse($permissions, 'Permissions retrieved successfully.');
    }

    public function update(Request $request, Role $role)
    {
        if ($role->name === Role::SUPER_ADMIN) {
            return $this->errorResponse('Super Admin permissions are implicit and cannot be changed.', 422);
        }

        $validated = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*.module' => ['required', 'string', 'max:50'],
            'permissions.*.can_read' => ['required', 'boolean'],
            'permissions.*.can_create' => ['required', 'boolean'],
            'permissions.*.can_update' => ['required', 'boolean'],
            'permissions.*.can_delete' => ['required', 'boolean'],
        ]);

        $permissions = DB::transaction(function () use ($validated, $role) {
            return collect($validated['permissions'])->map(function (array $permission) use ($role) {
                return RolePermission::updateOrCreate(
                    [
                        'role_id' => $role->id,
                        'module' => $permission['module'],
                    ],
                    [
                        'can_read' => $permission['can_read'],
                        'can_create' => $permission['can_create'],
                        'can_update' => $permission['can_update'],
                        'can_delete' => $permission['can_delete'],
                        'BC' => auth()->user()->BC,
                        'UID' => auth()->user()->username,
                    ]
                );
            })->values();
        });

        return $this->successResponse($permissions, 'Permissions updated successfully.');
    }
}
