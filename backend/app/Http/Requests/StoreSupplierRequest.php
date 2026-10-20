<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'Code' => 'required|string|max:50|unique:suppliers',
  'name' => 'required|string|max:100',
  'type' => 'required|in:normal,service',
);
    }
}
