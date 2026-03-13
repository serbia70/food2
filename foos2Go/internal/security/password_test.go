package security

import (
	"testing"
)

func TestLooksLikeBcryptHash(t *testing.T) {
	hash, err := HashPassword("secret")
	if err != nil {
		t.Fatalf("hash password failed: %v", err)
	}
	if !LooksLikeBcryptHash(hash) {
		t.Fatalf("expected bcrypt hash to be detected")
	}
	if LooksLikeBcryptHash("secret") {
		t.Fatalf("expected plain text not to look like bcrypt hash")
	}
}

func TestVerifyPasswordWithBcryptHash(t *testing.T) {
	hash, err := HashPassword("secret")
	if err != nil {
		t.Fatalf("hash password failed: %v", err)
	}
	ok, needsUpgrade := VerifyPassword(hash, "secret")
	if !ok {
		t.Fatalf("expected hash verification to succeed")
	}
	if needsUpgrade {
		t.Fatalf("expected bcrypt hash not to require upgrade")
	}
}

func TestVerifyPasswordWithPlaintextFallback(t *testing.T) {
	ok, needsUpgrade := VerifyPassword("secret", "secret")
	if !ok {
		t.Fatalf("expected plaintext fallback verification to succeed")
	}
	if !needsUpgrade {
		t.Fatalf("expected plaintext fallback to require upgrade")
	}
}

func TestVerifyPasswordRejectsMismatch(t *testing.T) {
	hash, err := HashPassword("secret")
	if err != nil {
		t.Fatalf("hash password failed: %v", err)
	}
	ok, _ := VerifyPassword(hash, "wrong")
	if ok {
		t.Fatalf("expected mismatched password to fail")
	}
}
