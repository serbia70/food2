import fs from 'fs';

const scriptPath = process.argv[1];
const source = fs.readFileSync(scriptPath, 'utf-8');

const checks = [
  { pattern: /git status --short/, name: 'git status --short' },
  { pattern: /git add -u/, name: 'git add -u' },
  { pattern: /git push -u origin HEAD/, name: 'git push -u origin HEAD' },
  { pattern: /set \/p MSG=/, name: 'set /p MSG=' },
  { pattern: /if "%MSG%"==""/, name: '空 message 检查' },
  { pattern: /继续提交并推送吗/, name: '二次确认提示' },
  { pattern: /if \/I not/, name: 'y 确认检查' },
];

console.log('安全上传脚本契约检查:');
let allPassed = true;

checks.forEach(({ pattern, name }) => {
  const match = pattern.test(source);
  const prefix = match ? '✓' : '✗';
  console.log(`  ${prefix} ${name}`);
  if (!match) {
    console.log(`    DEBUG: Pattern: ${pattern}`);
    console.log(`    DEBUG: Found? ${match}`);
    allPassed = false;
  }
});

if (allPassed) {
  console.log('\n✓ 所有检查通过');
  process.exit(0);
} else {
  console.log('\n✗ 部分检查失败');
  process.exit(1);
}
