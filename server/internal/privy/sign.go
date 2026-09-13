package privy

import (
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"strings"
)

// AuthorizationSignature signs one request with one authorization key.
//
// Privy's enclave verifies an ECDSA P-256 signature over a canonical
// serialisation of the request before it will act on an owned wallet. Without
// it, Privy holds the wallet but cannot move funds — and neither can anyone who
// has stolen only the app secret.
//
// headers carries every privy-* header the request will actually send. They
// are part of the signed payload, so one sent but not signed — an idempotency
// key, say — makes the signature verify against a different request than the
// one that arrives, and Privy rejects it as though the key were wrong.
func AuthorizationSignature(method, url string, body any, appID, privateKeyB64 string, headers map[string]any) (string, error) {
	key, err := parseKey(privateKeyB64)
	if err != nil {
		return "", err
	}

	signedHeaders := map[string]any{"privy-app-id": appID}
	for k, v := range headers {
		signedHeaders[k] = v
	}

	payload := map[string]any{
		"version": 1,
		"method":  strings.ToUpper(method),
		"url":     url,
		"body":    body,
		"headers": signedHeaders,
	}

	canonical, err := CanonicalJSON(payload)
	if err != nil {
		return "", err
	}

	digest := sha256.Sum256([]byte(canonical))
	der, err := ecdsa.SignASN1(rand.Reader, key, digest[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(der), nil
}

// parseKey accepts a bare base64 PKCS8 key, Privy's `wallet-auth:` prefixed
// form, or a PEM block.
func parseKey(raw string) (*ecdsa.PrivateKey, error) {
	s := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(raw), "wallet-auth:"))

	if strings.Contains(s, "BEGIN") {
		for _, line := range strings.Split(s, "\n") {
			if strings.Contains(line, "BEGIN") || strings.Contains(line, "END") {
				continue
			}
			s = strings.TrimSpace(line)
		}
	}
	s = strings.NewReplacer("\n", "", "\r", "", " ", "").Replace(s)

	der, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("authorization key is not base64: %w", err)
	}

	parsed, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, fmt.Errorf("authorization key is not PKCS8: %w", err)
	}

	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("authorization key is %T, want ECDSA P-256", parsed)
	}
	return key, nil
}
