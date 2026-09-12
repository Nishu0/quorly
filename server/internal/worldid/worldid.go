// Package worldid verifies World ID Selfie Check proofs.
//
// Selfie Check is a medium-assurance credential: liveness and facial
// similarity, valid 90 days, with no one-person-one-account guarantee. That
// makes it right for what we use it for — proving a live human was behind an
// approval click — and wrong for identity or Sybil resistance. Authority to
// approve comes from the Privy key quorum; this only proves the click was live.
package worldid

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ChallengeTTL matches IDKit's default RP signature window.
const ChallengeTTL = 5 * time.Minute

// SelfieCheckValidity is how long a credential stays good without reuse.
const SelfieCheckValidity = 90 * 24 * time.Hour

// Result is the complete IDKit payload. Forward it verbatim — remapping
// response identifiers is explicitly called out as unsupported.
type Result struct {
	ProtocolVersion  string            `json:"protocol_version"`
	Nonce            string            `json:"nonce"`
	Responses        []json.RawMessage `json:"responses"`
	UserPresenceDone bool              `json:"user_presence_completed,omitempty"`
}

type Verification struct {
	OK          bool
	Nullifier   string
	Environment string
	Raw         json.RawMessage
	Code        string
	Detail      string
}

type Client struct {
	BaseURL     string
	RPID        string
	Environment string
	HTTP        *http.Client
	// Demo skips the network entirely so the flow stays demonstrable while
	// Selfie Check access is still gated.
	Demo bool
}

func New(baseURL, rpID, environment string, demo bool) *Client {
	return &Client{
		BaseURL:     baseURL,
		RPID:        rpID,
		Environment: environment,
		HTTP:        &http.Client{Timeout: 20 * time.Second},
		Demo:        demo || rpID == "",
	}
}

// Verify checks a proof server-side. Never call this from a browser.
//
// The nullifier we keep is the one the verifier returns — never one the client
// sent us, which would make the whole exercise decorative.
func (c *Client) Verify(ctx context.Context, result Result, action string) (Verification, error) {
	if c.Demo {
		return Verification{
			OK:          true,
			Nullifier:   "demo_" + result.Nonce,
			Environment: "demo",
			Raw:         json.RawMessage(`{"demo":true}`),
		}, nil
	}

	payload := map[string]any{
		"protocol_version":        result.ProtocolVersion,
		"nonce":                   result.Nonce,
		"responses":               result.Responses,
		"action":                  action,
		"environment":             c.Environment,
		"user_presence_completed": result.UserPresenceDone,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Verification{}, err
	}

	url := fmt.Sprintf("%s/api/v4/verify/%s", c.BaseURL, c.RPID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return Verification{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return Verification{}, err
	}
	defer res.Body.Close()

	var parsed struct {
		Success     bool   `json:"success"`
		Nullifier   string `json:"nullifier"`
		Environment string `json:"environment"`
		Code        string `json:"code"`
		Detail      string `json:"detail"`
	}
	raw := new(bytes.Buffer)
	if _, err := raw.ReadFrom(res.Body); err != nil {
		return Verification{}, err
	}
	_ = json.Unmarshal(raw.Bytes(), &parsed)

	if res.StatusCode != http.StatusOK || !parsed.Success {
		return Verification{
			OK:     false,
			Raw:    raw.Bytes(),
			Code:   orDefault(parsed.Code, fmt.Sprintf("http_%d", res.StatusCode)),
			Detail: parsed.Detail,
		}, nil
	}

	return Verification{
		OK:          true,
		Nullifier:   parsed.Nullifier,
		Environment: orDefault(parsed.Environment, c.Environment),
		Raw:         raw.Bytes(),
	}, nil
}

// Signal binds a proof to one invoice and one approver, so a proof captured
// for one payout is meaningless against any other.
func Signal(invoiceID, memberID string) string {
	return invoiceID + ":" + memberID
}

// Explain turns verifier codes into copy a manager can act on.
func Explain(code, detail string) string {
	switch code {
	case "all_verifications_failed":
		return "The Selfie Check didn't pass. Try again in better lighting."
	case "verification_error":
		return "That proof couldn't be verified. Please start a fresh check."
	case "app_not_migrated":
		return "This app isn't on World ID 4.0 yet — check the Developer Portal."
	case "user_presence_failed":
		return "Liveness check failed. Make sure it's you in front of the camera."
	case "failed_by_host_app":
		// World App itself refused the request rather than producing a bad
		// proof — in practice the credential isn't available to that account:
		// Selfie Check not enabled for this app, or the wallet isn't enrolled.
		return "World App couldn't run the Selfie Check. The account needs to be " +
			"enrolled in Selfie Check, and the app needs it enabled in the Developer Portal."
	}
	if detail != "" {
		return detail
	}
	if code != "" {
		return "Selfie Check failed (" + code + ")."
	}
	return "Selfie Check failed."
}

func orDefault(v, fallback string) string {
	if v != "" {
		return v
	}
	return fallback
}
