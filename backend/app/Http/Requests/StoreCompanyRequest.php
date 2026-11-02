<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'name' => 'required|string|max:100',
  'address' => 'nullable|string',
  'phone' => 'nullable|string|max:15',
  'email' => 'nullable|email|max:100',
);
    }
}
