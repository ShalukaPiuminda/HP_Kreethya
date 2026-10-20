<?php

namespace App\Http\Controllers\Api\V1;

use Illuminate\Database\Eloquent\Model;

abstract class GeneratedCodeCrudController extends BranchScopedCrudController
{
    abstract protected function codeField(): string;

    abstract protected function codePrefix(): string;

    protected function codeWidth(): int
    {
        return 4;
    }

    protected function prepareValidatedData(
        array $validated,
        ?Model $model = null
    ): array {
        if ($model === null) {
            $validated[$this->codeField()] = $this->nextCode();
        }

        return parent::prepareValidatedData($validated, $model);
    }

    private function nextCode(): string
    {
        $modelClass = $this->modelClass();
        $prefix = $this->codePrefix();
        $field = $this->codeField();
        $maximum = $modelClass::query()
            ->where($field, 'like', $prefix.'%')
            ->pluck($field)
            ->map(function (string $code) use ($prefix) {
                return (int) substr($code, strlen($prefix));
            })
            ->max() ?? 0;

        return $prefix.str_pad(
            (string) ($maximum + 1),
            $this->codeWidth(),
            '0',
            STR_PAD_LEFT
        );
    }
}
