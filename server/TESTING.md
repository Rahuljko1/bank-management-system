# Manual test checklist

Run the server and frontend locally, then record pass/fail and a screenshot for each test in the project report.

| Area | Test | Expected result |
| --- | --- | --- |
| Registration | Register with valid data | User and fictional savings account are created. |
| Registration | Duplicate email/username | API rejects it with a clear error. |
| Login | Invalid password | Session is not created. |
| Transfer | Valid recipient and correct OTP | Balances and debit/credit ledger rows update once. |
| Transfer | Wrong OTP / expired OTP | No balance or ledger change; attempts are limited. |
| Transfer | Reuse idempotency key | Same completed result is returned; no duplicate transfer. |
| Account blocking | Admin blocks account | Transfer and bill payment from it are rejected. |
| Beneficiaries | Add, edit, delete | Only the signed-in user's saved beneficiary changes. |
| Bill payment | Valid demo bill | One debit, bill history entry and updated fictional balance appear. |
| Support | Submit ticket | User sees ticket; admin can change its status. |
| Admin | Normal user opens admin API/page | Access is denied. |
| Reports | Filter/export activity | CSV and on-screen figures match the signed-in user's ledger. |
