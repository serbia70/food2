package security

import "golang.org/x/crypto/bcrypt"

const bcryptPrefix = "$2"

func HashPassword(plain string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func LooksLikeBcryptHash(stored string) bool {
	return len(stored) >= 4 && stored[:2] == bcryptPrefix
}

func VerifyPassword(stored string, plain string) (ok bool, needsUpgrade bool) {
	if LooksLikeBcryptHash(stored) {
		return bcrypt.CompareHashAndPassword([]byte(stored), []byte(plain)) == nil, false
	}
	return stored == plain, stored == plain
}
