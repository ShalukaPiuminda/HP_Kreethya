<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array (
  'item_code' => 'sometimes|string|max:50|unique:items,item_code',
  'item_description' => 'sometimes|string|max:200',
);
    }
}
