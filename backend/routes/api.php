<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Health check
Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'version' => '1.0.0']);
});

// Public routes
Route::post('/v1/login', [App\Http\Controllers\Api\V1\Auth\AuthController::class, 'login'])
    ->middleware('throttle:5,1');

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/v1/logout', [App\Http\Controllers\Api\V1\Auth\AuthController::class, 'logout']);
    Route::get('/v1/user', [App\Http\Controllers\Api\V1\Auth\AuthController::class, 'user']);
    Route::get('/v1/features', [App\Http\Controllers\Api\V1\DeveloperController::class, 'enabledFeatures']);

    // Help desk: support requests forwarded to the vendor's Task Manager
    Route::get('/v1/help-desk/meta', [App\Http\Controllers\Api\V1\HelpDeskController::class, 'meta'])
        ->middleware('role.permission:help-desk,can_read');
    Route::get('/v1/help-desk/requests', [App\Http\Controllers\Api\V1\HelpDeskController::class, 'index'])
        ->middleware('role.permission:help-desk,can_read');
    Route::get('/v1/help-desk/requests/{id}', [App\Http\Controllers\Api\V1\HelpDeskController::class, 'show'])
        ->whereNumber('id')
        ->middleware('role.permission:help-desk,can_read');
    Route::post('/v1/help-desk/requests', [App\Http\Controllers\Api\V1\HelpDeskController::class, 'store'])
        ->middleware(['role.permission:help-desk,can_create', 'throttle:10,1']);

    // Developer (vendor) controls: paid features & SMS setup
    Route::middleware('developer')->group(function () {
        Route::get('/v1/developer/features', [App\Http\Controllers\Api\V1\DeveloperController::class, 'features']);
        Route::put('/v1/developer/features/{key}', [App\Http\Controllers\Api\V1\DeveloperController::class, 'updateFeature']);
        Route::get('/v1/developer/sms-settings', [App\Http\Controllers\Api\V1\DeveloperController::class, 'smsSettings']);
        Route::put('/v1/developer/sms-settings', [App\Http\Controllers\Api\V1\DeveloperController::class, 'updateSmsSettings']);
        Route::post('/v1/developer/sms-test', [App\Http\Controllers\Api\V1\DeveloperController::class, 'testSms']);
    });

    // SMS notifications (paid feature)
    Route::get('/v1/sms/logs', [App\Http\Controllers\Api\V1\SmsController::class, 'logs'])
        ->middleware(['feature:sms', 'role.permission:sms,can_read']);
    Route::get('/v1/sms/summary', [App\Http\Controllers\Api\V1\SmsController::class, 'summary'])
        ->middleware(['feature:sms', 'role.permission:sms,can_read']);
    Route::get('/v1/sms/customers', [App\Http\Controllers\Api\V1\SmsController::class, 'customers'])
        ->middleware(['feature:sms', 'role.permission:sms,can_create']);
    Route::post('/v1/sms/custom', [App\Http\Controllers\Api\V1\SmsController::class, 'sendCustom'])
        ->middleware(['feature:sms', 'role.permission:sms,can_create']);
    Route::post('/v1/sms/logs/{id}/resend', [App\Http\Controllers\Api\V1\SmsController::class, 'resend'])
        ->whereNumber('id')
        ->middleware(['feature:sms', 'role.permission:sms,can_create']);
    Route::delete('/v1/sms/logs/{id}', [App\Http\Controllers\Api\V1\SmsController::class, 'destroy'])
        ->whereNumber('id')
        ->middleware(['feature:sms', 'role.permission:sms,can_delete']);
    Route::post('/v1/sms/arrears/bulk',[App\Http\Controllers\Api\V1\SmsController::class, 'sendArrearsBulk'])
        ->middleware(['feature:sms', 'role.permission:sms,can_create']);
    Route::post('/v1/sms/arrears/{agreementId}', [App\Http\Controllers\Api\V1\SmsController::class, 'sendArrears'])
        ->whereNumber('agreementId')
        ->middleware(['feature:sms', 'role.permission:sms,can_create']);

    Route::get('/v1/payment-options', [App\Http\Controllers\Api\V1\PaymentOptionController::class, 'index']);

    // Permissions (Restricted to roles module access)
    Route::get('/v1/permissions', [App\Http\Controllers\Api\V1\PermissionController::class, 'index'])->middleware('super.admin');
    Route::put('/v1/permissions/{role}', [App\Http\Controllers\Api\V1\PermissionController::class, 'update'])->middleware('super.admin');
    Route::get('/v1/system/backups', [App\Http\Controllers\Api\V1\SystemBackupController::class, 'index'])->middleware('super.admin');
    Route::post('/v1/system/backups', [App\Http\Controllers\Api\V1\SystemBackupController::class, 'store'])->middleware('super.admin');
    Route::get('/v1/system/backups/{backup}/download', [App\Http\Controllers\Api\V1\SystemBackupController::class, 'download'])->middleware('super.admin');

    // Master Registries with dynamic RBAC checks
    Route::apiResource('/v1/companies', App\Http\Controllers\Api\V1\CompanyController::class)->middleware('role.permission:companies');
    Route::apiResource('/v1/branches', App\Http\Controllers\Api\V1\BranchController::class)->middleware('role.permission:branches');
    Route::apiResource('/v1/departments', App\Http\Controllers\Api\V1\DepartmentController::class)->middleware('role.permission:departments');
    Route::apiResource('/v1/stores', App\Http\Controllers\Api\V1\StoreController::class)->middleware('role.permission:stores');
    Route::apiResource('/v1/categories', App\Http\Controllers\Api\V1\CategoryController::class)->middleware('role.permission:categories');
    Route::apiResource('/v1/brands', App\Http\Controllers\Api\V1\BrandController::class)->middleware('role.permission:brands');
    Route::apiResource('/v1/makes', App\Http\Controllers\Api\V1\MakeController::class)->middleware('role.permission:makes');
    Route::apiResource('/v1/colors', App\Http\Controllers\Api\V1\ColorController::class)->middleware('role.permission:colors');
    Route::apiResource('/v1/items', App\Http\Controllers\Api\V1\ItemController::class)->middleware('role.permission:items');
    Route::apiResource('/v1/customers', App\Http\Controllers\Api\V1\CustomerController::class)->middleware('role.permission:customers');
    Route::apiResource('/v1/suppliers', App\Http\Controllers\Api\V1\SupplierController::class)->middleware('role.permission:suppliers');
    Route::apiResource('/v1/schemas', App\Http\Controllers\Api\V1\SchemaController::class)->middleware('role.permission:schemas');
    Route::apiResource('/v1/guarantors', App\Http\Controllers\Api\V1\GuarantorController::class)->middleware('role.permission:guarantors');
    Route::apiResource('/v1/banks', App\Http\Controllers\Api\V1\BankController::class)->middleware('role.permission:banks');
    Route::apiResource('/v1/bank-branches', App\Http\Controllers\Api\V1\BankBranchController::class)->middleware('role.permission:banks');
    Route::apiResource('/v1/areas', App\Http\Controllers\Api\V1\AreaController::class)->middleware('role.permission:areas');
    Route::apiResource('/v1/routes', App\Http\Controllers\Api\V1\RouteController::class)->middleware('role.permission:routes');
    Route::apiResource('/v1/salesmen', App\Http\Controllers\Api\V1\SalesmanController::class)->middleware('role.permission:salesmen');
    Route::apiResource('/v1/roles', App\Http\Controllers\Api\V1\RoleController::class)->middleware('super.admin');
    Route::apiResource('/v1/users', App\Http\Controllers\Api\V1\UserController::class)->middleware('super.admin');
    Route::apiResource('/v1/sales-return-reasons', App\Http\Controllers\Api\V1\SalesReturnReasonController::class)->middleware('role.permission:sales-return-reasons');

    // ─── Inventory & Stock ────────────────────────────────────
    Route::get('/v1/stock', [App\Http\Controllers\Api\V1\StockController::class, 'index'])
        ->middleware('role.permission:items');
    Route::post('/v1/stock/receive', [App\Http\Controllers\Api\V1\StockController::class, 'receive'])
        ->middleware('role.permission:items');
    Route::post('/v1/stock/transfer', [App\Http\Controllers\Api\V1\StockController::class, 'transfer'])
        ->middleware('role.permission:items');
    Route::patch('/v1/stock/opening-serials/{transNo}', [App\Http\Controllers\Api\V1\StockController::class, 'updateOpeningSerials'])
        ->middleware('role.permission:items');
    Route::get('/v1/stock/reorder-alerts', [App\Http\Controllers\Api\V1\StockController::class, 'reorderAlerts'])
        ->middleware('role.permission:items');
    Route::get('/v1/stock/{itemCode}', [App\Http\Controllers\Api\V1\StockController::class, 'stockLevel'])
        ->middleware('role.permission:items');
    Route::get('/v1/stock/{itemCode}/batches', [App\Http\Controllers\Api\V1\StockController::class, 'batches'])
        ->middleware('role.permission:items');
    Route::get('/v1/stock/{itemCode}/movements', [App\Http\Controllers\Api\V1\StockController::class, 'movements'])
        ->middleware('role.permission:items');

    // Purchases
    Route::get('/v1/purchase-orders/open', [App\Http\Controllers\Api\V1\PurchaseReceiptController::class, 'openOrders'])
        ->middleware('role.permission:purchases');
    Route::post('/v1/purchase-orders/{purchaseOrder}/approve', [App\Http\Controllers\Api\V1\PurchaseOrderController::class, 'approve'])
        ->middleware('role.permission:purchases');
    Route::post('/v1/purchase-orders/{purchaseOrder}/cancel', [App\Http\Controllers\Api\V1\PurchaseOrderController::class, 'cancel'])
        ->middleware('role.permission:purchases');
    Route::apiResource('/v1/purchase-orders', App\Http\Controllers\Api\V1\PurchaseOrderController::class)
        ->middleware('role.permission:purchases');

    Route::get('/v1/purchase-receipts', [App\Http\Controllers\Api\V1\PurchaseReceiptController::class, 'index'])
        ->middleware('role.permission:purchases');
    Route::post('/v1/purchase-receipts', [App\Http\Controllers\Api\V1\PurchaseReceiptController::class, 'store'])
        ->middleware('role.permission:purchases');
    Route::get('/v1/purchase-receipts/{purchaseReceipt}', [App\Http\Controllers\Api\V1\PurchaseReceiptController::class, 'show'])
        ->middleware('role.permission:purchases');
    Route::patch('/v1/purchase-receipts/{purchaseReceipt}/serials', [App\Http\Controllers\Api\V1\PurchaseReceiptController::class, 'updateSerials'])
        ->middleware('role.permission:purchases');

    Route::get('/v1/supplier-payments/outstanding', [App\Http\Controllers\Api\V1\SupplierPaymentController::class, 'outstanding'])
        ->middleware('role.permission:purchases');
    Route::get('/v1/supplier-payments', [App\Http\Controllers\Api\V1\SupplierPaymentController::class, 'index'])
        ->middleware('role.permission:purchases');
    Route::post('/v1/supplier-payments', [App\Http\Controllers\Api\V1\SupplierPaymentController::class, 'store'])
        ->middleware('role.permission:purchases');
    Route::get('/v1/supplier-payments/{supplierPayment}', [App\Http\Controllers\Api\V1\SupplierPaymentController::class, 'show'])
        ->middleware('role.permission:purchases');

    // Sales and customer accounts
    Route::get('/v1/sales-invoices', [App\Http\Controllers\Api\V1\SalesInvoiceController::class, 'index'])
        ->middleware('role.permission:sales');
    Route::post('/v1/sales-invoices', [App\Http\Controllers\Api\V1\SalesInvoiceController::class, 'store'])
        ->middleware('role.permission:sales');
    Route::get('/v1/sales-invoices/{salesInvoice}/print-data', [App\Http\Controllers\Api\V1\SalesInvoiceController::class, 'printData'])
        ->middleware('role.permission:sales');
    Route::get('/v1/sales-invoices/{salesInvoice}', [App\Http\Controllers\Api\V1\SalesInvoiceController::class, 'show'])
        ->middleware('role.permission:sales');

    Route::get('/v1/customer-advances', [App\Http\Controllers\Api\V1\CustomerAdvanceController::class, 'index'])
        ->middleware('role.permission:sales');
    Route::post('/v1/customer-advances', [App\Http\Controllers\Api\V1\CustomerAdvanceController::class, 'store'])
        ->middleware('role.permission:sales');
    Route::get('/v1/customer-advances/{customerAdvance}', [App\Http\Controllers\Api\V1\CustomerAdvanceController::class, 'show'])
        ->middleware('role.permission:sales');

    Route::get('/v1/customer-payments/outstanding', [App\Http\Controllers\Api\V1\CustomerPaymentController::class, 'outstanding'])
        ->middleware('role.permission:sales');
    Route::get('/v1/customer-payments', [App\Http\Controllers\Api\V1\CustomerPaymentController::class, 'index'])
        ->middleware('role.permission:sales');
    Route::post('/v1/customer-payments', [App\Http\Controllers\Api\V1\CustomerPaymentController::class, 'store'])
        ->middleware('role.permission:sales');
    Route::get('/v1/customer-payments/{customerPayment}', [App\Http\Controllers\Api\V1\CustomerPaymentController::class, 'show'])
        ->middleware('role.permission:sales');

    Route::get('/v1/sales-returns', [App\Http\Controllers\Api\V1\SalesReturnController::class, 'index'])
        ->middleware('role.permission:sales');
    Route::post('/v1/sales-returns', [App\Http\Controllers\Api\V1\SalesReturnController::class, 'store'])
        ->middleware('role.permission:sales');
    Route::get('/v1/sales-returns/{salesReturn}', [App\Http\Controllers\Api\V1\SalesReturnController::class, 'show'])
        ->middleware('role.permission:sales');

    // Cheque clearing
    Route::get('/v1/cheques/summary', [App\Http\Controllers\Api\V1\ChequeController::class, 'summary'])
        ->middleware('role.permission:accounts');
    Route::get('/v1/cheques/customer', [App\Http\Controllers\Api\V1\ChequeController::class, 'customerIndex'])
        ->middleware('role.permission:accounts');
    Route::post('/v1/cheques/customer/{cheque}/pass', [App\Http\Controllers\Api\V1\ChequeController::class, 'passCustomer'])
        ->middleware('role.permission:accounts,can_update');
    Route::post('/v1/cheques/customer/{cheque}/return', [App\Http\Controllers\Api\V1\ChequeController::class, 'returnCustomer'])
        ->middleware('role.permission:accounts,can_update');
    Route::get('/v1/cheques/supplier', [App\Http\Controllers\Api\V1\ChequeController::class, 'supplierIndex'])
        ->middleware('role.permission:accounts');
    Route::post('/v1/cheques/supplier/{cheque}/pass', [App\Http\Controllers\Api\V1\ChequeController::class, 'passSupplier'])
        ->middleware('role.permission:accounts,can_update');
    Route::post('/v1/cheques/supplier/{cheque}/return', [App\Http\Controllers\Api\V1\ChequeController::class, 'returnSupplier'])
        ->middleware('role.permission:accounts,can_update');

    // Service tracking and repairs
    Route::get('/v1/service-tickets/options', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'options'])
        ->middleware('role.permission:service');
    Route::get('/v1/service-tickets/summary', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'summary'])
        ->middleware('role.permission:service');
    Route::post('/v1/service-tickets/{serviceTicket}/dispatch', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'dispatch'])
        ->middleware('role.permission:service,can_update');
    Route::post('/v1/service-tickets/{serviceTicket}/receive-back', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'receiveBack'])
        ->middleware('role.permission:service,can_update');
    Route::post('/v1/service-tickets/{serviceTicket}/assign-technician', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'assignTechnician'])
        ->middleware('role.permission:service,can_update');
    Route::post('/v1/service-tickets/{serviceTicket}/complete-repair', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'completeRepair'])
        ->middleware('role.permission:service,can_update');
    Route::post('/v1/service-tickets/{serviceTicket}/invoice', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'invoice'])
        ->middleware('role.permission:service,can_update');
    Route::post('/v1/service-tickets/{serviceTicket}/customer-payment', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'customerPayment'])
        ->middleware('role.permission:service,can_update');
    Route::post('/v1/service-tickets/{serviceTicket}/supplier-payment', [App\Http\Controllers\Api\V1\ServiceTicketController::class, 'supplierPayment'])
        ->middleware('role.permission:service,can_update');
    Route::apiResource('/v1/service-tickets', App\Http\Controllers\Api\V1\ServiceTicketController::class)
        ->middleware('role.permission:service');

    // Financial operations
    Route::get('/v1/finance/options', [App\Http\Controllers\Api\V1\FinancialController::class, 'options'])
        ->middleware('role.permission:accounts');
    Route::get('/v1/finance/summary', [App\Http\Controllers\Api\V1\FinancialController::class, 'summary'])
        ->middleware('role.permission:accounts');
    Route::get('/v1/accounts', [App\Http\Controllers\Api\V1\FinancialController::class, 'accounts'])
        ->middleware('role.permission:accounts');
    Route::post('/v1/accounts', [App\Http\Controllers\Api\V1\FinancialController::class, 'storeAccount'])
        ->middleware('role.permission:accounts,can_create');
    Route::put('/v1/accounts/{id}', [App\Http\Controllers\Api\V1\FinancialController::class, 'updateAccount'])
        ->middleware('role.permission:accounts,can_update');
    Route::delete('/v1/accounts/{id}', [App\Http\Controllers\Api\V1\FinancialController::class, 'deleteAccount'])
        ->middleware('role.permission:accounts,can_delete');
    Route::get('/v1/vouchers', [App\Http\Controllers\Api\V1\FinancialController::class, 'vouchers'])
        ->middleware('role.permission:accounts');
    Route::post('/v1/vouchers', [App\Http\Controllers\Api\V1\FinancialController::class, 'storeVoucher'])
        ->middleware('role.permission:accounts,can_create');
    Route::post('/v1/vouchers/{id}/post', [App\Http\Controllers\Api\V1\FinancialController::class, 'postVoucher'])
        ->middleware('role.permission:accounts,can_update');
    Route::post('/v1/vouchers/{id}/cancel', [App\Http\Controllers\Api\V1\FinancialController::class, 'cancelVoucher'])
        ->middleware('role.permission:accounts,can_update');
    Route::get('/v1/expenses', [App\Http\Controllers\Api\V1\FinancialController::class, 'expenses'])
        ->middleware('role.permission:accounts');
    Route::post('/v1/expenses', [App\Http\Controllers\Api\V1\FinancialController::class, 'storeExpense'])
        ->middleware('role.permission:accounts,can_create');
    Route::get('/v1/bank-entries', [App\Http\Controllers\Api\V1\FinancialController::class, 'bankEntries'])
        ->middleware('role.permission:accounts');
    Route::post('/v1/bank-entries', [App\Http\Controllers\Api\V1\FinancialController::class, 'storeBankEntry'])
        ->middleware('role.permission:accounts,can_create');
    Route::get('/v1/reports/overview', [App\Http\Controllers\Api\V1\ReportingController::class, 'overview'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/trial-balance', [App\Http\Controllers\Api\V1\ReportingController::class, 'trialBalance'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/options', [App\Http\Controllers\Api\V1\ReportingController::class, 'options'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/day-ends', [App\Http\Controllers\Api\V1\ReportingController::class, 'dayEnds'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/stock-in-hand', [App\Http\Controllers\Api\V1\ReportingController::class, 'stockInHand'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/bin-card', [App\Http\Controllers\Api\V1\ReportingController::class, 'binCard'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/purchases', [App\Http\Controllers\Api\V1\ReportingController::class, 'purchases'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/sales', [App\Http\Controllers\Api\V1\ReportingController::class, 'sales'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/hire-purchase', [App\Http\Controllers\Api\V1\ReportingController::class, 'hirePurchase'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/cash-flow', [App\Http\Controllers\Api\V1\ReportingController::class, 'cashFlow'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/day-end-preview', [App\Http\Controllers\Api\V1\ReportingController::class, 'dayEndPreview'])
        ->middleware('role.permission:reports');
    Route::post('/v1/reports/day-end-close', [App\Http\Controllers\Api\V1\ReportingController::class, 'closeDay'])
        ->middleware('role.permission:reports,can_create');
    Route::get('/v1/reports/custom', [App\Http\Controllers\Api\V1\CustomReportController::class, 'published'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/filter-options', [App\Http\Controllers\Api\V1\CustomReportController::class, 'filterOptions'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/custom/{slug}/run', [App\Http\Controllers\Api\V1\CustomReportController::class, 'run'])
        ->middleware('role.permission:reports');
    Route::get('/v1/reports/custom/{slug}/export', [App\Http\Controllers\Api\V1\CustomReportController::class, 'export'])
        ->middleware('role.permission:reports');

    // ─── Report Builder: developer account only ─────────────
    Route::post('/v1/report-builder/preview', [App\Http\Controllers\Api\V1\CustomReportController::class, 'preview'])
        ->middleware('developer');
    Route::post('/v1/report-builder/preview-export', [App\Http\Controllers\Api\V1\CustomReportController::class, 'previewExport'])
        ->middleware('developer');
    Route::get('/v1/report-builder/filter-options', [App\Http\Controllers\Api\V1\CustomReportController::class, 'filterOptions'])
        ->middleware('developer');
    Route::get('/v1/report-builder', [App\Http\Controllers\Api\V1\CustomReportController::class, 'index'])
        ->middleware('developer');
    Route::post('/v1/report-builder', [App\Http\Controllers\Api\V1\CustomReportController::class, 'store'])
        ->middleware('developer');
    Route::get('/v1/report-builder/{id}', [App\Http\Controllers\Api\V1\CustomReportController::class, 'show'])
        ->whereNumber('id')
        ->middleware('developer');
    Route::put('/v1/report-builder/{id}', [App\Http\Controllers\Api\V1\CustomReportController::class, 'update'])
        ->whereNumber('id')
        ->middleware('developer');
    Route::delete('/v1/report-builder/{id}', [App\Http\Controllers\Api\V1\CustomReportController::class, 'destroy'])
        ->whereNumber('id')
        ->middleware('developer');

    // ─── Hire Purchase ────────────────────────────────────────
    Route::post('/v1/hp/calculate', [App\Http\Controllers\Api\V1\HPController::class, 'calculate'])
        ->middleware('role.permission:hire-purchase');
    Route::get('/v1/hp/options', [App\Http\Controllers\Api\V1\HPController::class, 'options'])
        ->middleware('role.permission:hire-purchase');
    Route::get('/v1/hp/summary', [App\Http\Controllers\Api\V1\HPController::class, 'summary'])
        ->middleware('role.permission:hire-purchase');
    Route::get('/v1/hp/installments', [App\Http\Controllers\Api\V1\HPController::class, 'installments'])
        ->middleware('role.permission:installments');
    Route::get('/v1/hp', [App\Http\Controllers\Api\V1\HPController::class, 'index'])
        ->middleware('role.permission:hire-purchase');
    Route::post('/v1/hp', [App\Http\Controllers\Api\V1\HPController::class, 'store'])
        ->middleware('role.permission:hire-purchase,can_create');
    Route::post('/v1/hp/opening', [App\Http\Controllers\Api\V1\HPController::class, 'storeOpening'])
        ->middleware('role.permission:hire-purchase,can_create');
    Route::post('/v1/hp/{id}/pay-at-once', [App\Http\Controllers\Api\V1\HPController::class, 'convert'])
        ->middleware('role.permission:hire-purchase,can_update');
    Route::post('/v1/hp/{id}/convert', [App\Http\Controllers\Api\V1\HPController::class, 'convert'])
        ->middleware('role.permission:hire-purchase,can_update');
    Route::post('/v1/hp/{id}/return', [App\Http\Controllers\Api\V1\HPController::class, 'returnAgreement'])
        ->middleware('role.permission:hire-purchase,can_update');
    Route::get('/v1/hp/{id}', [App\Http\Controllers\Api\V1\HPController::class, 'show'])
        ->middleware('role.permission:hire-purchase');

    // ─── Reminder Letters (arrears) ───────────────────────────
    Route::get('/v1/reminder-letters', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'index'])
        ->middleware('role.permission:reminder-letters');
    Route::get('/v1/reminder-letters/settings', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'settings'])
        ->middleware('role.permission:reminder-letters');
    Route::put('/v1/reminder-letters/settings', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'updateSettings'])
        ->middleware('role.permission:reminder-letters,can_update');
    Route::get('/v1/reminder-letters/templates', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'templates'])
        ->middleware('role.permission:reminder-letters');
    Route::put('/v1/reminder-letters/templates/{stage}', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'updateTemplate'])
        ->whereNumber('stage')
        ->middleware('role.permission:reminder-letters,can_update');
    Route::post('/v1/reminder-letters/render', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'render'])
        ->middleware('role.permission:reminder-letters,can_read');
    Route::post('/v1/reminder-letters/mark-printed', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'markPrinted'])
        ->middleware('role.permission:reminder-letters,can_create');
    Route::put('/v1/reminder-letters/next-date', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'updateNextDate'])
        ->middleware('role.permission:reminder-letters,can_update');
    Route::delete('/v1/reminder-letters/next-date', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'clearNextDate'])
        ->middleware('role.permission:reminder-letters,can_update');
    Route::get('/v1/reminder-letters/history', [App\Http\Controllers\Api\V1\ReminderLetterController::class, 'history'])
        ->middleware('role.permission:reminder-letters');

    // ─── Installments ─────────────────────────────────────────
    Route::get('/v1/installments/{id}', [App\Http\Controllers\Api\V1\HPController::class, 'getInstallment'])
        ->middleware('role.permission:installments');
    Route::post('/v1/installments/{id}/pay', [App\Http\Controllers\Api\V1\HPController::class, 'payInstallment'])
        ->middleware('role.permission:installments,can_create');
});
