<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\BankDetail;
use App\Services\ChequeEntryService;
use Illuminate\Http\Request;

class PaymentOptionController extends BaseController
{
    public function __construct(private readonly ChequeEntryService $chequeEntryService)
    {
    }

    public function index(Request $request)
    {
        return $this->successResponse([
            'cheque_banks' => $this->chequeEntryService->options($request->user()->BC),
            'bank_accounts' => BankDetail::query()
                ->where('BC', $request->user()->BC)
                ->orderBy('bank_name')
                ->orderBy('account_no')
                ->get(['id', 'bank_name', 'account_no']),
        ]);
    }
}
