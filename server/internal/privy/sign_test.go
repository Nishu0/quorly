package privy

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"sort"
	"strings"
	"testing"
)

func testKey(t *testing.T) (string, *ecdsa.PublicKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(der), &key.PublicKey
}

// canon is reimplemented independently of the package on purpose: if the test
// used the package's own serialiser, a bug would cancel out on both sides and
// the test would pass while the real signature covered nothing.
func canon(v any) string {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			kb, _ := json.Marshal(k)
			parts = append(parts, string(kb)+":"+canon(t[k]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func verify(t *testing.T, pub *ecdsa.PublicKey, sig string, method, url string, body any, appID string) bool {
	t.Helper()
	payload := map[string]any{
		"version": json.Number("1"),
		"method":  strings.ToUpper(method),
		"url":     url,
		"body":    body,
		"headers": map[string]any{"privy-app-id": appID},
	}
	digest := sha256.Sum256([]byte(canon(payload)))
	der, err := base64.StdEncoding.DecodeString(sig)
	if err != nil {
		t.Fatal(err)
	}
	return ecdsa.VerifyASN1(pub, digest[:], der)
}

const (
	url   = "https://api.privy.io/v1/wallets/w_1/transfer"
	appID = "app_1"
)

func body() map[string]any {
	return map[string]any{"amount": "2400000000", "recipient": "0xabc"}
}

func TestSignatureVerifies(t *testing.T) {
	keyB64, pub := testKey(t)
	sig, err := AuthorizationSignature("POST", url, body(), appID, keyB64)
	if err != nil {
		t.Fatal(err)
	}
	if !verify(t, pub, sig, "POST", url, body(), appID) {
		t.Error("the enclave would reject a signature we consider valid")
	}
}

func TestSignatureDoesNotCarryToADifferentRecipient(t *testing.T) {
	keyB64, pub := testKey(t)
	sig, _ := AuthorizationSignature("POST", url, body(), appID, keyB64)

	tampered := body()
	tampered["recipient"] = "0xattacker"
	if verify(t, pub, sig, "POST", url, tampered, appID) {
		t.Error("signature covered a different recipient — funds could be redirected")
	}
}

func TestSignatureDoesNotCarryToADifferentAmount(t *testing.T) {
	keyB64, pub := testKey(t)
	sig, _ := AuthorizationSignature("POST", url, body(), appID, keyB64)

	tampered := body()
	tampered["amount"] = "999999000000"
	if verify(t, pub, sig, "POST", url, tampered, appID) {
		t.Error("signature covered a different amount")
	}
}

func TestSignatureDoesNotCarryToADifferentWallet(t *testing.T) {
	keyB64, pub := testKey(t)
	sig, _ := AuthorizationSignature("POST", url, body(), appID, keyB64)
	if verify(t, pub, sig, "POST", "https://api.privy.io/v1/wallets/w_2/transfer", body(), appID) {
		t.Error("signature covered a different wallet")
	}
}

func TestAcceptsWalletAuthPrefix(t *testing.T) {
	keyB64, pub := testKey(t)
	sig, err := AuthorizationSignature("POST", url, body(), appID, "wallet-auth:"+keyB64)
	if err != nil {
		t.Fatal(err)
	}
	if !verify(t, pub, sig, "POST", url, body(), appID) {
		t.Error("prefixed key produced an invalid signature")
	}
}

func TestCanonicalJSONKeepsNestedFields(t *testing.T) {
	// The bug this guards: a serialiser that drops nested fields would sign an
	// empty body, and the signature would cover no amount and no recipient.
	got, err := CanonicalJSON(map[string]any{"body": body()})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"body":{"amount":"2400000000","recipient":"0xabc"}}`
	if got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestCanonicalJSONIsOrderIndependent(t *testing.T) {
	a, _ := CanonicalJSON(map[string]any{"b": 1, "a": map[string]any{"d": 2, "c": 3}})
	b, _ := CanonicalJSON(map[string]any{"a": map[string]any{"c": 3, "d": 2}, "b": 1})
	if a != b {
		t.Errorf("key order changed the signed bytes:\n%s\n%s", a, b)
	}
}

func TestCanonicalJSONDoesNotEscapeHTML(t *testing.T) {
	// Go escapes <, > and & by default; the enclave does not, so the bytes
	// would differ and every signature over such a value would be rejected.
	got, _ := CanonicalJSON(map[string]any{"note": "a<b&c"})
	if !strings.Contains(got, "a<b&c") {
		t.Errorf("got %s, want unescaped", got)
	}
}
