<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'notifylk' => [
        'url' => env('NOTIFYLK_URL', 'https://app.notify.lk/api/v1/send'),
        'user_id' => env('NOTIFYLK_USER_ID'),
        'api_key' => env('NOTIFYLK_API_KEY'),
        'sender_id' => env('NOTIFYLK_SENDER_ID'),
        'timeout' => (int) env('NOTIFYLK_TIMEOUT', 10),
        // CA certificate bundle path, for PHP builds with none configured (cURL error 60 on Windows/WAMP).
        'ca_bundle' => env('NOTIFYLK_CA_BUNDLE'),
        'reminder_time' => env('SMS_REMINDER_TIME', '09:00'),
    ],

    // Hidden vendor account that switches paid features on/off (php artisan erp:developer-user).
    'developer' => [
        'password' => env('DEVELOPER_PASSWORD'),
        'branch' => env('DEVELOPER_BC'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
