// Payslip helpers shared by PayslipScreen and SalaryReportScreen so the
// "net payable" total and the Paid/Pending status stay consistent across both.

// Net payable = net salary + net wage. Salaried and daily-wage staff can each
// have one of these be zero, so a report that reads only `netSalary` drops the
// entire earnings of a wage-only employee.
export function payslipNetPayable(p) {
  if (!p) return 0;
  const netSalary = Number(p.netSalary || 0);
  const netWage = Number(p.netWage || 0);
  const salary = Number.isNaN(netSalary) ? 0 : netSalary;
  const wage = Number.isNaN(netWage) ? 0 : netWage;
  return salary + wage;
}

// A payslip is only "Paid" when the backend explicitly marks it disbursed.
// We must NOT infer payment from a positive amount — a computed-but-undisbursed
// payslip (net payable ₹15,000) would otherwise stamp "PAID" on a financial
// document (app hero + the downloadable/shared PDF).
export function payslipPaid(p) {
  if (!p) return false;
  if (p.paid === true || p.isPaid === true) return true;
  const status = String(p.paymentStatus || p.status || '').toUpperCase();
  if (status === 'PAID' || status === 'DISBURSED') return true;
  if (p.paidAt || p.disbursedAt || p.paidOn) return true;
  return false;
}
