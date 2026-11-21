// Regression check: Employee MPIN step must receive and define onOtpChange.
// Run: node scripts/check-login.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/screens/LoginScreen.js'), 'utf8');
const checks = {
  'handler defined': /const onOtpChange\s*=/.test(src),
  'prop passed to OtpStep': /<OtpStep[\s\S]*?onOtpChange=\{onOtpChange\}/.test(src),
  'prop destructured in OtpStep': /function OtpStep\(\{[\s\S]*?\bonOtpChange\b[\s\S]*?\}\)/.test(src),
  'input wired': /onChangeText=\{onOtpChange\}/.test(src),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) { console.error('FAIL:', failed.join(', ')); process.exit(1); }
console.log('PASS: employee MPIN onOtpChange wiring OK');
