<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'login' => ['required_without:email', 'nullable', 'string', 'max:100'],
            'email' => ['required_without:login', 'nullable', 'string', 'max:100'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        // "login" accepts a username or an email address; "email" is kept for older clients.
        $login = mb_strtolower(trim($credentials['login'] ?? $credentials['email']));
        $user = User::with('role.permissions')
            ->where(function ($query) use ($login) {
                $query->whereRaw('LOWER(email) = ?', [$login])
                    ->orWhereRaw('LOWER(username) = ?', [$login]);
            })
            ->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (!$user->role) {
            return response()->json([
                'success' => false,
                'message' => 'This account has no role assigned. Contact an administrator.',
            ], 403);
        }

        $token = $user->createToken(
            $credentials['device_name'] ?? 'erp-web'
        )->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Login successful.',
            'data' => [
                'user' => $user,
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully.',
        ]);
    }

    public function user(Request $request)
    {
        return response()->json([
            'success' => true,
            'message' => 'Authenticated user retrieved successfully.',
            'data' => $request->user()->load('role.permissions'),
        ]);
    }
}
