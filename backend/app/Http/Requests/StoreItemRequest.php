<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'item_code' => 'required|string|max:50|unique:items',
  'item_description' => 'required|string|max:200',
);
    }
}
