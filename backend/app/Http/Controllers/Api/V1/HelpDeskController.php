<?php

namespace App\Http\Controllers\Api\V1;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Help desk: forwards support requests to the vendor's Task Manager and
 * reads back their progress. The Task Manager API key stays on the server
 * (config/services.php -> task_manager), never in the browser.
 */
class HelpDeskController extends BaseController
{
    public function meta(): JsonResponse
    {
        return $this->forward(fn (PendingRequest $http) => $http->get($this->url('/integration/meta')));
    }

    public function index(): JsonResponse
    {
        return $this->forward(fn (PendingRequest $http) => $http->get($this->url('/integration/requests')));
    }

    public function show(int $id): JsonResponse
    {
        return $this->forward(fn (PendingRequest $http) => $http->get($this->url("/integration/requests/{$id}")));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'task_type' => ['required', 'string', 'max:50'],
            'priority' => ['nullable', 'string', 'max:20'],
            'description' => ['required', 'string', 'max:10000'],
            'requester_phone' => ['nullable', 'string', 'max:50'],
            'page_url' => ['nullable', 'string', 'max:500'],
            'files' => ['nullable', 'array', 'max:5'],
            'files.*' => ['file', 'mimes:jpg,jpeg,png,gif,webp,pdf', 'max:10240'],
        ]);

        $user = $request->user();
        $payload = array_filter([
            ...collect($validated)->except('files')->all(),
            'requester_name' => $user->BC ? "{$user->username} ({$user->BC})" : $user->username,
            'requester_email' => $user->email,
        ], fn ($value) => $value !== null && $value !== '');

        return $this->forward(function (PendingRequest $http) use ($request, $payload) {
            foreach ($request->file('files', []) as $file) {
                $http->attach('files[]', $file->getContent(), $file->getClientOriginalName());
            }

            return $http->post($this->url('/integration/requests'), $payload);
        }, 201);
    }

    /**
     * Call the Task Manager and translate its response into this API's
     * { success, message, data } envelope.
     */
    private function forward(callable $call, int $successCode = 200): JsonResponse
    {
        if (! config('services.task_manager.url') || ! config('services.task_manager.key')) {
            return $this->errorResponse('The help desk is not configured yet. Please contact your system provider.', 503);
        }

        try {
            /** @var Response $response */
            $response = $call(Http::withHeaders(['X-Api-Key' => config('services.task_manager.key')])
                ->acceptJson()
                ->timeout(20));
        } catch (ConnectionException) {
            return $this->errorResponse('Could not reach the help desk right now. Please try again shortly.', 502);
        }

        if ($response->successful()) {
            return $this->successResponse($response->json('data'), $response->json('message') ?? 'Success', $successCode);
        }

        return match ($response->status()) {
            422 => $this->errorResponse($response->json('message') ?? 'Please check the form.', 422, $response->json('errors')),
            404 => $this->errorResponse('Request not found.', 404),
            401 => $this->errorResponse('The help desk connection is not authorised. Please contact your system provider.', 502),
            default => $this->errorResponse('The help desk returned an error. Please try again shortly.', 502),
        };
    }

    private function url(string $path): string
    {
        return rtrim(config('services.task_manager.url'), '/').$path;
    }
}
