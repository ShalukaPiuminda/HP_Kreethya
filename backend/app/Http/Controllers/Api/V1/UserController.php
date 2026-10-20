<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends BaseController
{
    public function index()
    {
        return $this->paginatedResponse(
            User::with('role')
                ->visibleToClients()
                ->where('BC', auth()->user()->BC)
                ->orderBy('username')
                ->paginate(50),
            'Users retrieved successfully.'
        );
    }

    public function show($id)
    {
        $user = $this->branchUser($id);

        return $this->successResponse(
            $user->load('role'),
            'User retrieved successfully.'
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'username' => ['required', 'string', 'max:50', 'unique:users,username'],
            'email' => ['required', 'email', 'max:100', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role_id' => ['required', 'exists:roles,id'],
        ]);

        $validated['email'] = mb_strtolower(trim($validated['email']));
        $validated['BC'] = auth()->user()->BC;

        return $this->successResponse(
            User::create($validated)->load('role'),
            'User created successfully.',
            201
        );
    }

    public function update(Request $request, $id)
    {
        $user = $this->branchUser($id);
        $validated = $request->validate([
            'username' => [
                'sometimes',
                'string',
                'max:50',
                Rule::unique('users', 'username')->ignore($user->id),
            ],
            'email' => [
                'sometimes',
                'email',
                'max:100',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'password' => ['sometimes', 'string', 'min:8'],
            'role_id' => ['sometimes', 'exists:roles,id'],
        ]);

        if (isset($validated['email'])) {
            $validated['email'] = mb_strtolower(trim($validated['email']));
        }

        $user->update($validated);

        return $this->successResponse(
            $user->load('role'),
            'User updated successfully.'
        );
    }

    public function destroy($id)
    {
        $user = $this->branchUser($id);

        if ($user->is(auth()->user())) {
            return $this->errorResponse('You cannot delete your own account.', 422);
        }

        $user->tokens()->delete();
        $user->delete();

        return $this->successResponse(null, 'User deleted successfully.');
    }

    private function branchUser($id): User
    {
        return User::whereKey($id)
            ->visibleToClients()
            ->where('BC', auth()->user()->BC)
            ->firstOrFail();
    }
}
