<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_cus_cheques', function (Blueprint $table) {
            $table->foreignId('bank_detail_id')->nullable()->after('realized_date')->constrained('bank_details');
            $table->text('return_reason')->nullable()->after('bank_detail_id');
            $table->foreignId('processed_by')->nullable()->after('return_reason')->constrained('users');
            $table->timestamp('status_changed_at')->nullable()->after('processed_by');
            $table->index(['BC', 'status', 'due_date'], 'idx_cus_cheque_status_due');
        });

        Schema::table('t_sup_cheques', function (Blueprint $table) {
            $table->foreignId('bank_detail_id')->nullable()->after('realized_date')->constrained('bank_details');
            $table->text('return_reason')->nullable()->after('bank_detail_id');
            $table->foreignId('processed_by')->nullable()->after('return_reason')->constrained('users');
            $table->timestamp('status_changed_at')->nullable()->after('processed_by');
            $table->index(['BC', 'status', 'release_date'], 'idx_sup_cheque_status_release');
        });

        Schema::table('t_bank_entries', function (Blueprint $table) {
            $table->foreignId('bank_detail_id')->nullable()->after('invoice_no')->constrained('bank_details');
        });

        Schema::create('cheque_status_histories', function (Blueprint $table) {
            $table->id();
            $table->enum('cheque_type', ['customer', 'supplier']);
            $table->unsignedBigInteger('cheque_id');
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->date('action_date');
            $table->foreignId('bank_detail_id')->nullable()->constrained('bank_details');
            $table->text('reason')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(
                ['cheque_type', 'cheque_id', 'created_at'],
                'idx_cheque_history_lookup'
            );
            $table->index(['BC', 'action_date'], 'idx_cheque_history_branch_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cheque_status_histories');

        Schema::table('t_bank_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bank_detail_id');
        });

        Schema::table('t_sup_cheques', function (Blueprint $table) {
            $table->dropIndex('idx_sup_cheque_status_release');
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropConstrainedForeignId('processed_by');
            $table->dropColumn(['return_reason', 'status_changed_at']);
        });

        Schema::table('t_cus_cheques', function (Blueprint $table) {
            $table->dropIndex('idx_cus_cheque_status_due');
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropConstrainedForeignId('processed_by');
            $table->dropColumn(['return_reason', 'status_changed_at']);
        });
    }
};
