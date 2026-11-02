<?php

namespace App\Http\Controllers\Api\V1;

use App\Services\ReminderLetterService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReminderLetterController extends BaseController
{
    public function __construct(private readonly ReminderLetterService $letters)
    {
    }

    public function index(Request $request)
    {
        $filters = $request->validate([
            'status' => ['nullable', Rule::in(['due', 'waiting', 'seizure_ready', 'seizure_issued'])],
            'stage' => ['nullable', 'integer', 'between:1,4'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        return $this->successResponse(
            $this->letters->arrearsList($request->user()->BC, $filters),
            'Arrears list retrieved.'
        );
    }

    public function settings()
    {
        return $this->successResponse([
            'settings' => $this->letters->settings(),
            'stages' => ReminderLetterService::STAGE_LABELS,
        ]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'letter1_after_days' => ['required', 'integer', 'between:0,365'],
            'letter2_after_days' => ['required', 'integer', 'between:0,365'],
            'letter3_after_days' => ['required', 'integer', 'between:0,365'],
            'seizure_after_days' => ['required', 'integer', 'between:0,365'],
            'settle_within_days' => ['required', 'integer', 'between:0,365'],
        ]);

        return $this->successResponse(
            $this->letters->saveSettings($data, $request->user()),
            'Reminder letter timing saved.'
        );
    }

    public function templates(Request $request)
    {
        return $this->successResponse([
            'templates' => $this->letters->templates(),
            'placeholders' => ReminderLetterService::PLACEHOLDERS,
            'stages' => ReminderLetterService::STAGE_LABELS,
            ...$this->letters->letterhead($request->user()->BC),
        ]);
    }

    public function updateTemplate(Request $request, int $stage)
    {
        abort_unless(isset(ReminderLetterService::STAGE_LABELS[$stage]), 404);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'body' => ['required', 'string', 'max:20000'],
        ]);

        return $this->successResponse(
            $this->letters->saveTemplate($stage, $data['title'], $data['body'], $request->user()),
            ReminderLetterService::STAGE_LABELS[$stage].' format saved.'
        );
    }

    public function render(Request $request)
    {
        $data = $request->validate([
            'invoice_nos' => ['required', 'array', 'min:1', 'max:500'],
            'invoice_nos.*' => ['required', 'string', 'max:50'],
            'stage' => ['required', 'integer', 'between:1,4'],
        ]);

        return $this->successResponse(
            $this->letters->renderLetters($request->user()->BC, $data['invoice_nos'], (int) $data['stage'])
        );
    }

    public function markPrinted(Request $request)
    {
        $data = $request->validate([
            'invoice_nos' => ['required', 'array', 'min:1', 'max:500'],
            'invoice_nos.*' => ['required', 'string', 'max:50'],
            'stage' => ['required', 'integer', 'between:1,4'],
        ]);

        $result = $this->letters->markPrinted(
            $request->user()->BC,
            $data['invoice_nos'],
            (int) $data['stage'],
            $request->user()
        );

        return $this->successResponse($result, "{$result['advanced']} agreement(s) moved to ".ReminderLetterService::STAGE_LABELS[(int) $data['stage']].'.');
    }

    public function updateNextDate(Request $request)
    {
        $data = $request->validate([
            'invoice_no' => ['required', 'string', 'max:50'],
            'next_print_date' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        return $this->successResponse(
            $this->letters->setNextDate($request->user()->BC, $data['invoice_no'], $data['next_print_date'], $data['note'] ?? null, $request->user()),
            'Next letter date updated.'
        );
    }

    public function clearNextDate(Request $request)
    {
        $invoiceNo = $request->validate(['invoice_no' => ['required', 'string', 'max:50']])['invoice_no'];

        return $this->successResponse(
            $this->letters->setNextDate($request->user()->BC, $invoiceNo, null, null, $request->user()),
            'Next letter date reset to automatic.'
        );
    }

    public function history(Request $request)
    {
        $invoiceNo = $request->validate(['invoice_no' => ['required', 'string', 'max:50']])['invoice_no'];

        return $this->successResponse($this->letters->history($request->user()->BC, $invoiceNo));
    }
}
