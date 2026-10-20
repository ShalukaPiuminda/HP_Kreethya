<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'Code' => 'sometimes|string|max:50|unique:customers,Code',
  'name' => 'sometimes|string|max:100',
  'NIC' => 'sometimes|string|max:15|unique:customers,NIC',
  'phone' => 'nullable|string|max:15',
  'address' => 'nullable|string',
);
    }
}
