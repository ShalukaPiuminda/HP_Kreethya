<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoleController extends BaseController
{
    public function index()
    {
        return $this->paginatedResponse(
            Role::withCount('users')->orderBy('name')->paginate(50),
            'Roles retrieved successfully.'
        );
    }

    public function show(Role $role)
    {
        return $this->successResponse(
            $role->load('permissions'),
            'Role retrieved successfully.'
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50', 'unique:roles,name'],
            'description' => ['nullable', 'string'],
        ]);

        return $this->successResponse(
            Role::create($validated),
            'Role created successfully.',
            201
        );
    }

    public function update(Request $request, Role $role)
    {
        $validated = $request->validate([
            'name' => [
                'sometimes',
                'string',
                'max:50',
                Rule::unique('roles', 'name')->ignore($role->id),
            ],
            'description' => ['nullable', 'string'],
        ]);

        if ($role->name === Role::SUPER_ADMIN && isset($validated['name']) && $validated['name'] !== Role::SUPER_ADMIN) {
            return $this->errorResponse('The Super Admin role name cannot be changed.', 422);
        }

        $role->update($validated);

        return $this->successResponse($role, 'Role updated successfully.');
    }

    public function destroy(Role $role)
    {
        if ($role->name === Role::SUPER_ADMIN) {
            return $this->errorResponse('The Super Admin role cannot be deleted.', 422);
        }

        if ($role->users()->exists()) {
            return $this->errorResponse('Reassign users before deleting this role.', 422);
        }

        $role->delete();

        return $this->successResponse(null, 'Role deleted successfully.');
    }
}
