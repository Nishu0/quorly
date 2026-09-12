package worldid

import (
	"fmt"
	"time"

	"github.com/worldcoin/idkit/go/idkit"
)

// RPContext is what the browser hands to World App. The nonce inside it is
// recorded as a single-use challenge, which is what makes this
// challenge-response rather than a proof anyone could have produced elsewhere.
type RPContext struct {
	RPID      string `json:"rp_id"`
	Nonce     string `json:"nonce"`
	CreatedAt uint64 `json:"created_at"`
	ExpiresAt uint64 `json:"expires_at"`
	Signature string `json:"signature"`
}

type Signer struct {
	signer *idkit.Signer
	rpID   string
}

// NewSigner keeps the RP key server-side. It must never reach the browser: it
// would let anyone mint approval challenges for any invoice.
func NewSigner(signingKeyHex, rpID string) (*Signer, error) {
	if signingKeyHex == "" || rpID == "" {
		return nil, fmt.Errorf("world signing is not configured")
	}
	s, err := idkit.NewSigner(signingKeyHex)
	if err != nil {
		return nil, fmt.Errorf("world signing key: %w", err)
	}
	return &Signer{signer: s, rpID: rpID}, nil
}

func (s *Signer) Sign(action string, ttl time.Duration) (RPContext, error) {
	sig, err := s.signer.SignRequest(
		idkit.WithAction(action),
		idkit.WithTTL(uint64(ttl.Seconds())),
	)
	if err != nil {
		return RPContext{}, err
	}
	return RPContext{
		RPID:      s.rpID,
		Nonce:     sig.Nonce,
		CreatedAt: sig.CreatedAt,
		ExpiresAt: sig.ExpiresAt,
		Signature: sig.Sig,
	}, nil
}
