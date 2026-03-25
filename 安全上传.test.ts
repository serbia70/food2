import { readFileSync } from 'fs';

const scriptPath = process.argv[2];
const source = readFileSync(scriptPath, 'utf-8');

// 必须包含的命令
assert.match(source, /git status --short/);
assert.match(source, /git add -u/);
assert.match(source, /git push -u origin HEAD/);

// 不能包含的危险命令
assert.doesNotMatch(source, /git add \.\b/);
assert.doesNotMatch(source, /git add -A/);

// 必须包含的交互逻辑
assert.match(source, /set /p MSG=/);
assert.match(source, /if "%MSG%"==""/);
assert.match(source, /继续提交并推送吗? \[y\/N\]:/);
assert.match(source, /if /I not "%CONFIRM%"=="y"/);

console.log('安全上传脚本契约检查通过');
