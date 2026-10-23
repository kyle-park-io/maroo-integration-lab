package main

// maroo-audit-threshold: 감사 epoch 비밀키의 몫 나누기, 부분 복호, 합쳐 열기. [Local]
//
//   deal     표준 입력 JSON {scalar_hex, holders, threshold, out_dir} 를 받아 몫 파일을 holder 마다 하나씩 쓴다
//   partial  --share <몫 파일> --envelope-hex <감사 공개 봉투>      이 봉투에만 쓰이는 부분값을 낸다
//   open     --envelope-hex <봉투> --threshold <t> --partial <파일>... [--onchain-digest-hex <해시>]
//
// 비밀값(감사 비밀키, 몫)은 표준 출력과 명령 인자에 싣지 않는다. 몫은 권한 0600 파일에만 쓴다.
// 이 레포의 shared/lib/audit-threshold.ts 가 vendor/clairveil 모듈 안에서 -overlay 로 빌드해 쓴다.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strings"

	"github.com/consensys/gnark-crypto/ecc/bn254/twistededwards"

	privacydisclosure "github.com/DELIGHT-LABS/clairveil/x/privacy/client/sdk/disclosure"
	privacyidentity "github.com/DELIGHT-LABS/clairveil/x/privacy/client/sdk/identity"
	privacycrypto "github.com/DELIGHT-LABS/clairveil/x/privacy/crypto"
	privacytypes "github.com/DELIGHT-LABS/clairveil/x/privacy/types"
)

type shareFile struct {
	Holder         string `json:"holder"`
	Index          int    `json:"index"`
	Threshold      int    `json:"threshold"`
	ShareHex       string `json:"share_hex"`
	SharePubHex    string `json:"share_pub_hex"`
	AuditPubKeyHex string `json:"audit_pubkey_hex"`
}

type partialFile struct {
	Holder         string `json:"holder"`
	Index          int    `json:"index"`
	EnvelopeSHA256 string `json:"envelope_sha256"`
	PartialHex     string `json:"partial_hex"`
}

func main() {
	if len(os.Args) < 2 {
		fatalf("usage: maroo-audit-threshold deal|partial|open")
	}
	var err error
	switch os.Args[1] {
	case "deal":
		err = deal()
	case "partial":
		err = partial(os.Args[2:])
	case "open":
		err = open(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fatalf("%v", err)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func pointHex(p twistededwards.PointAffine) string {
	b := p.Bytes()
	return hex.EncodeToString(b[:])
}

func decodePoint(h string) (twistededwards.PointAffine, error) {
	b, err := hex.DecodeString(strings.TrimSpace(h))
	if err != nil {
		return twistededwards.PointAffine{}, err
	}
	p, err := privacycrypto.DecodeCanonicalPoint(b)
	if err != nil {
		return twistededwards.PointAffine{}, err
	}
	return *p, nil
}

func printJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func deal() error {
	var req struct {
		ScalarHex string   `json:"scalar_hex"`
		Holders   []string `json:"holders"`
		Threshold int      `json:"threshold"`
		OutDir    string   `json:"out_dir"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		return fmt.Errorf("failed to read deal request: %w", err)
	}
	scalar, ok := new(big.Int).SetString(strings.TrimSpace(req.ScalarHex), 16)
	if !ok {
		return fmt.Errorf("scalar_hex is not hex")
	}
	pub := privacyidentity.DerivePubKeyFromScalar(scalar)
	shares, err := SplitScalar(scalar, req.Threshold, len(req.Holders), rand.Reader)
	if err != nil {
		return err
	}
	combined, err := CombinePublic(shares[:req.Threshold])
	if err != nil {
		return err
	}
	if !combined.Equal(pub) {
		return fmt.Errorf("share public keys do not combine to the audit public key")
	}
	if err := os.MkdirAll(req.OutDir, 0o700); err != nil {
		return err
	}
	type holderOut struct {
		Holder      string `json:"holder"`
		Index       int    `json:"index"`
		SharePubHex string `json:"share_pub_hex"`
		File        string `json:"file"`
	}
	out := struct {
		AuditPubKeyHex string      `json:"audit_pubkey_hex"`
		Threshold      int         `json:"threshold"`
		Holders        []holderOut `json:"holders"`
	}{AuditPubKeyHex: pointHex(*pub), Threshold: req.Threshold}
	for i, s := range shares {
		f := shareFile{
			Holder: req.Holders[i], Index: s.Index, Threshold: req.Threshold,
			ShareHex: privacyidentity.ScalarToFixedHex(s.Value), SharePubHex: pointHex(SharePublic(s)), AuditPubKeyHex: out.AuditPubKeyHex,
		}
		path := filepath.Join(req.OutDir, "share-"+req.Holders[i]+".json")
		b, _ := json.MarshalIndent(f, "", "  ")
		if err := os.WriteFile(path, b, 0o600); err != nil {
			return err
		}
		out.Holders = append(out.Holders, holderOut{Holder: f.Holder, Index: f.Index, SharePubHex: f.SharePubHex, File: path})
	}
	return printJSON(out)
}

func readShare(path string) (shareFile, Share, error) {
	var f shareFile
	b, err := os.ReadFile(path)
	if err != nil {
		return f, Share{}, err
	}
	if err := json.Unmarshal(b, &f); err != nil {
		return f, Share{}, err
	}
	v, ok := new(big.Int).SetString(f.ShareHex, 16)
	if !ok {
		return f, Share{}, fmt.Errorf("share_hex in %s is not hex", path)
	}
	s := Share{Index: f.Index, Value: v}
	if pointHex(SharePublic(s)) != f.SharePubHex {
		return f, Share{}, fmt.Errorf("share in %s does not match its public value", path)
	}
	return f, s, nil
}

func envelopeArg(h string) ([]byte, string, error) {
	b, err := hex.DecodeString(strings.TrimSpace(h))
	if err != nil {
		return nil, "", fmt.Errorf("envelope is not hex: %w", err)
	}
	sum := sha256.Sum256(b)
	return b, hex.EncodeToString(sum[:]), nil
}

func partial(args []string) error {
	fs := flag.NewFlagSet("partial", flag.ContinueOnError)
	sharePath := fs.String("share", "", "share file")
	envHex := fs.String("envelope-hex", "", "audit disclosure envelope")
	if err := fs.Parse(args); err != nil {
		return err
	}
	f, s, err := readShare(*sharePath)
	if err != nil {
		return err
	}
	env, sum, err := envelopeArg(*envHex)
	if err != nil {
		return err
	}
	p, err := PartialDecrypt(s, env)
	if err != nil {
		return err
	}
	return printJSON(partialFile{Holder: f.Holder, Index: p.Index, EnvelopeSHA256: sum, PartialHex: pointHex(p.Point)})
}

type multi []string

func (m *multi) String() string     { return strings.Join(*m, ",") }
func (m *multi) Set(v string) error { *m = append(*m, v); return nil }

func open(args []string) error {
	fs := flag.NewFlagSet("open", flag.ContinueOnError)
	envHex := fs.String("envelope-hex", "", "audit disclosure envelope")
	threshold := fs.Int("threshold", 2, "partials needed")
	digest := fs.String("onchain-digest-hex", "", "audit disclosure digest recorded on chain")
	skipCheck := fs.Bool("no-envelope-check", false, "skip the envelope hash check and try decryption anyway (demonstration)")
	var files multi
	fs.Var(&files, "partial", "partial file (repeat)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	env, sum, err := envelopeArg(*envHex)
	if err != nil {
		return err
	}
	var parts []Partial
	var holders []string
	for _, path := range files {
		var f partialFile
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(b, &f); err != nil {
			return err
		}
		if f.EnvelopeSHA256 != sum && !*skipCheck {
			return fmt.Errorf("%s의 부분값은 다른 암호문에 대해 만든 것입니다", f.Holder)
		}
		pt, err := decodePoint(f.PartialHex)
		if err != nil {
			return fmt.Errorf("partial from %s: %w", f.Holder, err)
		}
		parts = append(parts, Partial{Index: f.Index, Point: pt})
		holders = append(holders, f.Holder)
	}
	plain, err := CombineAndDecrypt(parts, env, *threshold)
	if err != nil {
		return err
	}
	payload, err := auditPayload(plain)
	if err != nil {
		return err
	}
	verification, err := privacydisclosure.VerifyPayload(payload, *digest)
	if err != nil {
		return err
	}
	return printJSON(map[string]any{"envelope_sha256": sum, "holders": holders, "payload": payload, "verification": verification})
}

// 감사 평문(전체 공개 평면)을 Clairveil SDK 의 Payload 로 옮긴다.
// SDK 의 payloadFromFixedV1 은 공개되지 않아 감사 평면에 필요한 부분만 같은 방식으로 옮겼다
// (x/privacy/client/sdk/disclosure/disclosure.go, v0.4.0 ca85b027).
func auditPayload(plain []byte) (*privacydisclosure.Payload, error) {
	fixed, err := privacytypes.UnmarshalDisclosurePlaintextV1(plain)
	if err != nil {
		return nil, err
	}
	if fixed.Plane != privacytypes.DisclosurePlaneFullV1 {
		return nil, fmt.Errorf("plaintext is not a full (audit) disclosure plane")
	}
	field := func(v *big.Int) string { return hex.EncodeToString(v.FillBytes(make([]byte, 32))) }
	address := func(spendX, spendY, viewX, viewY *big.Int) (string, error) {
		var spend, view twistededwards.PointAffine
		spend.X.SetBigInt(spendX)
		spend.Y.SetBigInt(spendY)
		view.X.SetBigInt(viewX)
		view.Y.SetBigInt(viewY)
		return privacytypes.EncodeShieldedAddressWithView(&spend, &view)
	}
	payload := &privacydisclosure.Payload{
		Version: privacydisclosure.PayloadVersion, Plane: privacydisclosure.PlaneAudit,
		Policy:      privacytypes.TransferPrivacyPolicyDiscloseAmountToFrom,
		OutputIndex: fixed.OutputIndex, CommitmentHex: field(fixed.Commitment), BlindingHex: field(fixed.DisclosureBlinding),
		AssetIDHex: field(fixed.AssetID), Amount: fixed.Amount.String(),
	}
	if payload.FromShieldedAddress, err = address(fixed.SenderSpendKeyX, fixed.SenderSpendKeyY, fixed.SenderViewKeyX, fixed.SenderViewKeyY); err != nil {
		return nil, err
	}
	if payload.ToShieldedAddress, err = address(fixed.RecipientSpendKeyX, fixed.RecipientSpendKeyY, fixed.RecipientViewKeyX, fixed.RecipientViewKeyY); err != nil {
		return nil, err
	}
	if payload.DisclosureDigestHex, _, err = privacydisclosure.ComputeExpectedDisclosureDigest(payload); err != nil {
		return nil, err
	}
	return payload, nil
}
