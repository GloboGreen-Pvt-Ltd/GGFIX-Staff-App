// Regression check: Employee MPIN login screen must not reference undefined
// handlers/components (Preview APK crashed with "Property 'onOtpChange' doesn't exist").
// Run: node scripts/check-login.js [path/to/LoginScreen.js]
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '../src/screens/LoginScreen.js');
const src = fs.readFileSync(file, 'utf8');
const checks = {
  'handler defined': /const onOtpChange\s*=/.test(src),
  'prop passed to OtpStep': /<OtpStep[\s\S]*?onOtpChange=\{onOtpChange\}/.test(src),
  'prop destructured in OtpStep': /function OtpStep\(\{[\s\S]*?\bonOtpChange\b[\s\S]*?\}\)/.test(src),
  'input wired': /onChangeText=\{onOtpChange\}/.test(src),
};
// Every JSX component used must be defined or imported (a bad merge left PinPad undefined).
for (const name of new Set([...src.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]))) {
  const defined = new RegExp(`(function|const|class)\\s+${name}\\b|\\b${name}\\s*=|:\\s*${name}\\b|import[^;]*\\b${name}\\b[^;]*from`).test(src);
  checks[`component ${name} defined`] = defined;
}
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) { console.error('FAIL:', failed.join(', ')); process.exit(1); }
console.log('PASS: employee MPIN login wiring OK');
