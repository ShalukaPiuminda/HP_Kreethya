<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A cancelled warranty keeps its sale details; status_before_cancel lets it be restored.
        Schema::table('serial_warranties', function (Blueprint $table) {
            $table->string('status_before_cancel', 20)->nullable()->after('status');
            $table->text('cancel_reason')->nullable()->after('status_before_cancel');
            $table->string('cancelled_by', 50)->nullable()->after('cancel_reason');
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by');
        });
    }

    public function down(): void
    {
        Schema::table('serial_warranties', function (Blueprint $table) {
            $table->dropColumn(['status_before_cancel', 'cancel_reason', 'cancelled_by', 'cancelled_at']);
        });
    }
};
