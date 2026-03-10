export function validateUserLoginInput(loginAccount: string, password: string) {
	return String(loginAccount || '').trim() && String(password || '').trim()
		? ''
		: '请输入账号和密码';
}
