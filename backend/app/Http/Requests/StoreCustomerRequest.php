<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'Code' => 'required|string|max:50|unique:customers',
  'name' => 'required|string|max:100',
  'NIC' => 'required|string|max:15|unique:customers',
  'phone' => 'nullable|string|max:15',
  'address' => 'nullable|string',
);
    }
}
