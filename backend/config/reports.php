<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Custom report files
    |--------------------------------------------------------------------------
    |
    | Report Builder reports are saved as JSON files in this folder so they are
    | deployed with the code. The server loads them into the database
    | automatically (see App\Services\Reports\CustomReportFileStore).
    |
    */

    'path' => resource_path('reports'),

    // Save/rename/delete report files whenever reports are created or edited in the Report Builder,
    // on every installation (PC or server). Copying the project to another customer then brings
    // every report with it: run the migrations and the reports load from these files.
    // Set REPORTS_WRITE_FILES=false to keep reports only in the database (file reports become view-only).
    'write_files' => (bool) env('REPORTS_WRITE_FILES', true),

    // Load new or changed report files automatically when reports are opened.
    'auto_sync' => (bool) env('REPORTS_AUTO_SYNC', true),

];
