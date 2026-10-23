package main

// 감사 epoch 비밀키를 t-of-n 몫으로 나누고, 몫을 다시 합치지 않은 채 감사 공개 하나만 여는 임계 복호화.
//
// Clairveil 감사 공개는 BN254 twisted Edwards 위의 ECIES 다(x/privacy/crypto/ecies.go).
// 암호문 머리의 임시 공개키 E 에 비밀키 k 를 곱한 점 kE 를 sha256 해 AES-GCM 키로 쓴다.
// 몫을 가진 사람 i 는 s_i·E 만 내고, 모은 쪽은 라그랑주 계수로 Σ λ_i·s_i·E = kE 를 만든다.
// 부분값은 그 암호문의 E 에만 묶여 있어 다른 암호문을 열지 못하고, k 는 어디에서도 다시 만들어지지 않는다.

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"math/big"

	"github.com/consensys/gnark-crypto/ecc/bn254/twistededwards"

	privacycrypto "github.com/DELIGHT-LABS/clairveil/x/privacy/crypto"
	privacytypes "github.com/DELIGHT-LABS/clairveil/x/privacy/types"
)

const nonceSize = 12

type Share struct {
	Index int
	Value *big.Int
}

type Partial struct {
	Index int
	Point twistededwards.PointAffine
}

func order() *big.Int {
	curve := twistededwards.GetEdwardsCurve()
	return new(big.Int).Set(&curve.Order)
}

// 차수 threshold-1 다항식의 상수항에 secret 을 두고 x=1..n 의 값을 몫으로 낸다.
func SplitScalar(secret *big.Int, threshold, n int, rnd io.Reader) ([]Share, error) {
	if threshold < 2 || threshold > n {
		return nil, fmt.Errorf("threshold %d must be between 2 and %d", threshold, n)
	}
	q := order()
	if secret.Sign() <= 0 || secret.Cmp(q) >= 0 {
		return nil, errors.New("secret scalar is outside the curve order")
	}
	coeffs := []*big.Int{new(big.Int).Set(secret)}
	for i := 1; i < threshold; i++ {
		c, err := randScalar(rnd, q)
		if err != nil {
			return nil, err
		}
		coeffs = append(coeffs, c)
	}
	shares := make([]Share, 0, n)
	for x := 1; x <= n; x++ {
		y := new(big.Int)
		for i := len(coeffs) - 1; i >= 0; i-- {
			y.Mul(y, big.NewInt(int64(x)))
			y.Add(y, coeffs[i])
			y.Mod(y, q)
		}
		shares = append(shares, Share{Index: x, Value: y})
	}
	return shares, nil
}

func randScalar(rnd io.Reader, q *big.Int) (*big.Int, error) {
	for {
		c, err := randInt(rnd, q)
		if err != nil {
			return nil, err
		}
		if c.Sign() != 0 {
			return c, nil
		}
	}
}

func randInt(rnd io.Reader, q *big.Int) (*big.Int, error) {
	buf := make([]byte, (q.BitLen()+7)/8+16)
	if _, err := io.ReadFull(rnd, buf); err != nil {
		return nil, err
	}
	return new(big.Int).Mod(new(big.Int).SetBytes(buf), q), nil
}

// x=0 에서의 라그랑주 계수. 같은 번호가 두 번 오면 거부한다.
func lagrangeAtZero(indices []int) (map[int]*big.Int, error) {
	q := order()
	seen := map[int]bool{}
	for _, i := range indices {
		if i <= 0 {
			return nil, fmt.Errorf("share index %d is invalid", i)
		}
		if seen[i] {
			return nil, fmt.Errorf("share index %d appears twice", i)
		}
		seen[i] = true
	}
	out := map[int]*big.Int{}
	for _, i := range indices {
		num, den := big.NewInt(1), big.NewInt(1)
		for _, j := range indices {
			if j == i {
				continue
			}
			num.Mul(num, big.NewInt(int64(-j)))
			num.Mod(num, q)
			den.Mul(den, big.NewInt(int64(i-j)))
			den.Mod(den, q)
		}
		inv := new(big.Int).ModInverse(den, q)
		if inv == nil {
			return nil, errors.New("lagrange denominator has no inverse")
		}
		out[i] = num.Mul(num, inv).Mod(num, q)
	}
	return out, nil
}

// 감사 공개 봉투에서 AES-GCM 에 쓰인 임시 공개키, nonce, 암호문을 꺼낸다. 감사 공개가 아니면 거부한다.
func splitAuditEnvelope(envelope []byte) (twistededwards.PointAffine, []byte, []byte, error) {
	raw, err := privacytypes.UnwrapEncryptedEnvelopeV1(envelope, privacytypes.EnvelopeAuditDisclosureV1)
	if err != nil {
		return twistededwards.PointAffine{}, nil, nil, fmt.Errorf("감사 공개 봉투가 아닙니다: %w", err)
	}
	size := privacycrypto.CanonicalPointSize
	if len(raw) < size+nonceSize {
		return twistededwards.PointAffine{}, nil, nil, errors.New("audit disclosure ciphertext is too short")
	}
	eph, err := privacycrypto.DecodeCanonicalPoint(raw[:size])
	if err != nil {
		return twistededwards.PointAffine{}, nil, nil, fmt.Errorf("invalid ephemeral public key: %w", err)
	}
	return *eph, raw[size : size+nonceSize], raw[size+nonceSize:], nil
}

// 몫 하나로 이 봉투에만 쓰이는 부분값 s_i·E 를 낸다.
func PartialDecrypt(share Share, envelope []byte) (Partial, error) {
	eph, _, _, err := splitAuditEnvelope(envelope)
	if err != nil {
		return Partial{}, err
	}
	var p twistededwards.PointAffine
	p.ScalarMultiplication(&eph, share.Value)
	if err := privacycrypto.ValidatePrimeSubgroupPoint(&p); err != nil {
		return Partial{}, fmt.Errorf("invalid partial point: %w", err)
	}
	return Partial{Index: share.Index, Point: p}, nil
}

func combinePoints(points map[int]twistededwards.PointAffine) (twistededwards.PointAffine, error) {
	indices := make([]int, 0, len(points))
	for i := range points {
		indices = append(indices, i)
	}
	lambda, err := lagrangeAtZero(indices)
	if err != nil {
		return twistededwards.PointAffine{}, err
	}
	var acc twistededwards.PointAffine
	acc.X.SetZero()
	acc.Y.SetOne()
	for i, pt := range points {
		var term twistededwards.PointAffine
		term.ScalarMultiplication(&pt, lambda[i])
		acc.Add(&acc, &term)
	}
	return acc, nil
}

// 부분값 threshold 개 이상을 합쳐 kE 를 만들고 그 봉투를 연다. 부분값이 다른 봉투의 것이면 AES-GCM 인증에서 실패한다.
func CombineAndDecrypt(partials []Partial, envelope []byte, threshold int) ([]byte, error) {
	if len(partials) < threshold {
		return nil, fmt.Errorf("부분값 %d개가 필요하지만 받은 부분값은 %d개입니다", threshold, len(partials))
	}
	points := map[int]twistededwards.PointAffine{}
	for _, p := range partials {
		if _, dup := points[p.Index]; dup {
			return nil, fmt.Errorf("몫 번호 %d의 부분값이 두 번 들어왔습니다", p.Index)
		}
		points[p.Index] = p.Point
	}
	_, nonce, ct, err := splitAuditEnvelope(envelope)
	if err != nil {
		return nil, err
	}
	shared, err := combinePoints(points)
	if err != nil {
		return nil, err
	}
	sb := shared.Bytes()
	key := sha256.Sum256(sb[:])
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, errors.New("AES-GCM 인증에 실패해 열리지 않았습니다. 부분값이 이 암호문이나 감사 키와 맞지 않습니다")
	}
	return plain, nil
}

// 몫의 공개값 s_i·G. 몫을 받은 사람이 자기 몫이 감사 공개키와 맞는지 확인할 때 쓴다.
func SharePublic(share Share) twistededwards.PointAffine {
	curve := twistededwards.GetEdwardsCurve()
	var p twistededwards.PointAffine
	p.ScalarMultiplication(&curve.Base, share.Value)
	return p
}

// 몫 threshold 개의 공개값을 합쳐 감사 공개키 kG 를 만든다.
func CombinePublic(shares []Share) (twistededwards.PointAffine, error) {
	points := map[int]twistededwards.PointAffine{}
	for _, s := range shares {
		if _, dup := points[s.Index]; dup {
			return twistededwards.PointAffine{}, fmt.Errorf("share index %d appears twice", s.Index)
		}
		points[s.Index] = SharePublic(s)
	}
	return combinePoints(points)
}
