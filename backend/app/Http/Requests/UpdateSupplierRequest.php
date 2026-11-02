<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'Code' => 'sometimes|string|max:50|unique:suppliers,Code',
  'name' => 'sometimes|string|max:100',
  'type' => 'sometimes|in:normal,service',
);
    }
}
