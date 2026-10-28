<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two-step warranty workflow: receive -> decide -> (repair) -> hand over.
 * The claim now tracks whether the unit is still with us, so it cannot be
 * claimed again until it has been handed back to the customer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_warranty_claims', function (Blueprint $table) {
            $table->string('resolution', 20)->nullable()->change();
            $table->string('status', 30)->default('received')->change();
            $table->text('intake_condition')->nullable()->after('problem_description');
            $table->string('accessories_received')->nullable()->after('intake_condition');
            $table->text('outcome_note')->nullable()->after('status');
            $table->date('decided_date')->nullable()->after('outcome_note');
            $table->string('decided_by', 50)->nullable()->after('decided_date');
            $table->date('delivered_date')->nullable()->after('completed_date');
            $table->string('collected_by')->nullable()->after('delivered_date');
            $table->text('handover_note')->nullable()->after('collected_by');
            $table->string('delivered_by', 50)->nullable()->after('handover_note');
            $table->index('status');
        });

        Schema::create('t_warranty_claim_events', function (Blueprint $table) {
            $table->id();
            $table->string('claim_no', 50)->index();
            $table->string('event', 40);
            $table->text('description')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50)->nullable();
            $table->timestamps();
        });

        DB::table('t_warranty_claims')->orderBy('id')->get()->each(function ($claim) {
            $ticketStatus = $claim->service_ticket_no
                ? DB::table('t_service_returns')->where('ticket_no', $claim->service_ticket_no)->value('status')
                : null;

            $status = match (true) {
                $claim->status === 'open' && $ticketStatus === 'repaired' => 'ready_for_pickup',
                $claim->status === 'open' => 'in_repair',
                $claim->status === 'completed' && $claim->resolution === 'refund' => 'refunded',
                default => 'delivered',
            };

            DB::table('t_warranty_claims')->where('id', $claim->id)->update([
                'status' => $status,
                'decided_date' => $claim->claim_date,
                'decided_by' => $claim->UID,
                'outcome_note' => $claim->remarks,
                'delivered_date' => $status === 'delivered' ? ($claim->completed_date ?? $claim->claim_date) : null,
            ]);

            DB::table('t_warranty_claim_events')->insert([
                'claim_no' => $claim->claim_no,
                'event' => 'migrated',
                'description' => "Claim carried over to the new warranty workflow as {$status}.",
                'BC' => $claim->BC,
                'UID' => 'system',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_warranty_claim_events');

        Schema::table('t_warranty_claims', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropColumn([
                'intake_condition',
                'accessories_received',
                'outcome_note',
                'decided_date',
                'decided_by',
                'delivered_date',
                'collected_by',
                'handover_note',
                'delivered_by',
            ]);
        });
    }
};
