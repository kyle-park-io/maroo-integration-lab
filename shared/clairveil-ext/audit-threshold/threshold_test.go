package main

import (
	"bytes"
	"crypto/rand"
	"math/big"
	"testing"

	"github.com/consensys/gnark-crypto/ecc/bn254/twistededwards"

	privacycrypto "github.com/DELIGHT-LABS/clairveil/x/privacy/crypto"
	privacytypes "github.com/DELIGHT-LABS/clairveil/x/privacy/types"
)

// 감사 공개 봉투 하나를 만든다. 평문은 길이만 맞춘 임의 바이트다.
func auditEnvelope(t *testing.T, pub twistededwards.PointAffine) ([]byte, []byte) {
	t.Helper()
	plain := make([]byte, privacytypes.DisclosurePlaintextV1Size)
	if _, err := rand.Read(plain); err != nil {
		t.Fatal(err)
	}
	raw, err := privacycrypto.AsymEncrypt(plain, pub)
	if err != nil {
		t.Fatal(err)
	}
	env, err := privacytypes.WrapEncryptedEnvelopeV1(privacytypes.EnvelopeAuditDisclosureV1, raw)
	if err != nil {
		t.Fatal(err)
	}
	return env, plain
}

func newSecret(t *testing.T) (*big.Int, twistededwards.PointAffine) {
	t.Helper()
	curve := twistededwards.GetEdwardsCurve()
	k, err := rand.Int(rand.Reader, &curve.Order)
	if err != nil {
		t.Fatal(err)
	}
	var pub twistededwards.PointAffine
	pub.ScalarMultiplication(&curve.Base, k)
	return k, pub
}

func partials(t *testing.T, shares []Share, env []byte, idx ...int) []Partial {
	t.Helper()
	var out []Partial
	for _, i := range idx {
		p, err := PartialDecrypt(shares[i-1], env)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	return out
}

func TestAnyTwoOfThreeOpenTheRequestedCiphertext(t *testing.T) {
	k, pub := newSecret(t)
	shares, err := SplitScalar(k, 2, 3, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	env, plain := auditEnvelope(t, pub)
	for _, pair := range [][]int{{1, 2}, {1, 3}, {2, 3}} {
		got, err := CombineAndDecrypt(partials(t, shares, env, pair...), env, 2)
		if err != nil {
			t.Fatalf("holders %v: %v", pair, err)
		}
		if !bytes.Equal(got, plain) {
			t.Fatalf("holders %v: plaintext mismatch", pair)
		}
	}
}

func TestOnePartialDoesNotOpen(t *testing.T) {
	k, pub := newSecret(t)
	shares, _ := SplitScalar(k, 2, 3, rand.Reader)
	env, _ := auditEnvelope(t, pub)
	if _, err := CombineAndDecrypt(partials(t, shares, env, 1), env, 2); err == nil {
		t.Fatal("one partial opened the ciphertext")
	}
}

func TestDuplicatePartialsDoNotCountTwice(t *testing.T) {
	k, pub := newSecret(t)
	shares, _ := SplitScalar(k, 2, 3, rand.Reader)
	env, _ := auditEnvelope(t, pub)
	if _, err := CombineAndDecrypt(partials(t, shares, env, 2, 2), env, 2); err == nil {
		t.Fatal("the same holder counted twice")
	}
}

func TestPartialsForOneCiphertextDoNotOpenAnother(t *testing.T) {
	k, pub := newSecret(t)
	shares, _ := SplitScalar(k, 2, 3, rand.Reader)
	requested, _ := auditEnvelope(t, pub)
	other, _ := auditEnvelope(t, pub)
	if _, err := CombineAndDecrypt(partials(t, shares, requested, 1, 2), other, 2); err == nil {
		t.Fatal("partials made for one ciphertext opened another")
	}
}

func TestOnlyAuditEnvelopesAreAccepted(t *testing.T) {
	k, pub := newSecret(t)
	shares, _ := SplitScalar(k, 2, 3, rand.Reader)
	plain := make([]byte, privacytypes.DisclosurePlaintextV1Size)
	raw, _ := privacycrypto.AsymEncrypt(plain, pub)
	user, err := privacytypes.WrapEncryptedEnvelopeV1(privacytypes.EnvelopeUserDisclosureV1, raw)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PartialDecrypt(shares[0], user); err == nil {
		t.Fatal("a user disclosure envelope was accepted")
	}
}

func TestSharePublicKeysCombineToTheAuditPublicKey(t *testing.T) {
	k, pub := newSecret(t)
	shares, _ := SplitScalar(k, 2, 3, rand.Reader)
	got, err := CombinePublic([]Share{shares[2], shares[0]})
	if err != nil {
		t.Fatal(err)
	}
	if !got.Equal(&pub) {
		t.Fatal("share public keys do not combine to the audit public key")
	}
}
