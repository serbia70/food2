import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const userAuthPath = resolve(process.cwd(), 'src/lib/user-auth.ts');
const userAuthBrowserPath = resolve(process.cwd(), 'src/lib/user-auth-browser.ts');
const userLoginPagePath = resolve(process.cwd(), 'src/pages/user/login.astro');

test('user auth request payloads use camelCase login/register fields', async () => {
  const [userAuthSource, userAuthBrowserSource, userLoginPageSource] = await Promise.all([
    readFile(userAuthPath, 'utf8'),
    readFile(userAuthBrowserPath, 'utf8'),
    readFile(userLoginPagePath, 'utf8'),
  ]);

  assert.match(userAuthSource, /loginAccount: payload\.loginAccount,/);
  assert.match(userAuthSource, /accountType: payload\.accountType,/);
  assert.doesNotMatch(userAuthSource, /login_account: payload\.loginAccount,/);
  assert.doesNotMatch(userAuthSource, /account_type: payload\.accountType,/);

  assert.match(userAuthBrowserSource, /loginAccount: payload\.loginAccount,/);
  assert.match(userAuthBrowserSource, /accountType: payload\.accountType,/);
  assert.doesNotMatch(userAuthBrowserSource, /login_account: payload\.loginAccount,/);
  assert.doesNotMatch(userAuthBrowserSource, /account_type: payload\.accountType,/);

  assert.match(userLoginPageSource, /loginAccount: payload\.loginAccount,/);
  assert.match(userLoginPageSource, /accountType: payload\.accountType,/);
  assert.doesNotMatch(userLoginPageSource, /login_account: payload\.loginAccount,/);
  assert.doesNotMatch(userLoginPageSource, /account_type: payload\.accountType,/);
});
