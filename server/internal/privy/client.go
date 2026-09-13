package privy

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	AppID     string
	AppSecret string
	BaseURL   string
	// AuthKeys is a list because a wallet owned by an m-of-n quorum rejects a
	// request that doesn't carry m signatures. One key is not enough.
	AuthKeys []string
	HTTP     *http.Client
}

func New(appID, appSecret, baseURL string, authKeys []string) *Client {
	return &Client{
		AppID:     appID,
		AppSecret: appSecret,
		BaseURL:   baseURL,
		AuthKeys:  authKeys,
		HTTP:      &http.Client{Timeout: 30 * time.Second},
	}
}

type APIError struct {
	Status int
	Body   string
	Method string
	Path   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("privy %s %s -> %d: %s", e.Method, e.Path, e.Status, e.Body)
}

type callOpts struct {
	sign           bool
	idempotencyKey string
}

func (c *Client) call(ctx context.Context, method, path string, body any, out any, opts callOpts) error {
	url := c.BaseURL + path

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("privy-app-id", c.AppID)
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString(
		[]byte(c.AppID+":"+c.AppSecret)))
	if opts.idempotencyKey != "" {
		req.Header.Set("privy-idempotency-key", opts.idempotencyKey)
	}

	if opts.sign && len(c.AuthKeys) > 0 {
		sigs := make([]string, 0, len(c.AuthKeys))
		for _, key := range c.AuthKeys {
			signBody := body
			if signBody == nil {
				signBody = map[string]any{}
			}
			sig, err := AuthorizationSignature(method, url, signBody, c.AppID, key)
			if err != nil {
				return fmt.Errorf("sign request: %w", err)
			}
			sigs = append(sigs, sig)
		}
		req.Header.Set("privy-authorization-signature", strings.Join(sigs, ","))
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return &APIError{Status: res.StatusCode, Body: string(raw), Method: method, Path: path}
	}
	if out != nil && len(raw) > 0 {
		return json.Unmarshal(raw, out)
	}
	return nil
}

/* --------------------------------------------------------------- key quorum */

type KeyQuorum struct {
	ID                     string `json:"id"`
	DisplayName            string `json:"display_name"`
	AuthorizationThreshold int    `json:"authorization_threshold"`
}

func (c *Client) CreateKeyQuorum(ctx context.Context, displayName string, publicKeys []string, threshold int) (KeyQuorum, error) {
	var out KeyQuorum
	err := c.call(ctx, http.MethodPost, "/v1/key_quorums", map[string]any{
		"display_name":            displayName,
		"public_keys":             publicKeys,
		"authorization_threshold": threshold,
	}, &out, callOpts{})
	return out, err
}

/* ------------------------------------------------------------------ wallets */

type Wallet struct {
	ID                     string   `json:"id"`
	Address                string   `json:"address"`
	ChainType              string   `json:"chain_type"`
	OwnerID                string   `json:"owner_id"`
	PolicyIDs              []string `json:"policy_ids"`
	AuthorizationThreshold int      `json:"authorization_threshold"`
}

type CreateWalletParams struct {
	ChainType   string
	DisplayName string
	ExternalID  string
	OwnerID     string
	PolicyIDs   []string
}

func (c *Client) CreateWallet(ctx context.Context, p CreateWalletParams) (Wallet, error) {
	body := map[string]any{"chain_type": orDefault(p.ChainType, "ethereum")}
	if p.DisplayName != "" {
		body["display_name"] = p.DisplayName
	}
	if p.ExternalID != "" {
		body["external_id"] = p.ExternalID
	}
	if p.OwnerID != "" {
		body["owner_id"] = p.OwnerID
	}
	if len(p.PolicyIDs) > 0 {
		body["policy_ids"] = p.PolicyIDs
	}

	var out Wallet
	err := c.call(ctx, http.MethodPost, "/v1/wallets", body, &out, callOpts{idempotencyKey: p.ExternalID})
	return out, err
}

func (c *Client) Wallet(ctx context.Context, walletID string) (Wallet, error) {
	var out Wallet
	err := c.call(ctx, http.MethodGet, "/v1/wallets/"+walletID, nil, &out, callOpts{})
	return out, err
}

func (c *Client) UpdateWalletPolicies(ctx context.Context, walletID string, policyIDs []string) (Wallet, error) {
	var out Wallet
	err := c.call(ctx, http.MethodPatch, "/v1/wallets/"+walletID,
		map[string]any{"policy_ids": policyIDs}, &out, callOpts{sign: true})
	return out, err
}

/* ------------------------------------------------------------------ intents */

type Intent struct {
	ID                      string `json:"id"`
	Status                  string `json:"status"`
	AuthorizationsCollected int    `json:"authorizations_collected"`
	AuthorizationThreshold  int    `json:"authorization_threshold"`
	Execution               struct {
		Status          string `json:"status"`
		TransactionHash string `json:"transaction_hash"`
		Hash            string `json:"hash"`
	} `json:"execution"`
}

// TxHash returns whichever field carried the hash, or "".
func (i Intent) TxHash() string {
	if i.Execution.TransactionHash != "" {
		return i.Execution.TransactionHash
	}
	return i.Execution.Hash
}

type TransferParams struct {
	WalletID string
	To       string
	// Amount is a human-decimal string ("2400.0"), not base units: Privy reads
	// the token's decimals off the contract and scales it itself. Sending base
	// units here asks for a transfer 10^decimals too large.
	Amount       string
	AssetAddress string
	Chain        string
	ReferenceID  string
}

// CreateTransferIntent proposes a payout. Nothing moves until the quorum's
// signers authorise it — the Slack approval thread is a UI over this object.
func (c *Client) CreateTransferIntent(ctx context.Context, p TransferParams) (Intent, error) {
	body := map[string]any{
		"source": map[string]any{
			// CustomTokenTransferSource: an arbitrary ERC-20 is named by its
			// contract, where a first-class asset would use "asset" instead.
			"asset_address": p.AssetAddress,
			"chain":         p.Chain,
		},
		"destination": map[string]any{"address": p.To},
		"amount":      p.Amount,
	}
	if p.ReferenceID != "" {
		body["reference_id"] = p.ReferenceID
	}

	var out Intent
	err := c.call(ctx, http.MethodPost, "/v1/intents/wallets/"+p.WalletID+"/transfer",
		body, &out, callOpts{sign: true, idempotencyKey: p.ReferenceID})
	return out, err
}

func (c *Client) Intent(ctx context.Context, intentID string) (Intent, error) {
	var out Intent
	err := c.call(ctx, http.MethodGet, "/v1/intents/"+intentID, nil, &out, callOpts{})
	return out, err
}

/* -------------------------------------------------------------------- users */

type User struct {
	ID             string `json:"id"`
	LinkedAccounts []struct {
		Type             string `json:"type"`
		Address          string `json:"address"`
		Email            string `json:"email"`
		WalletClientType string `json:"wallet_client_type"`
	} `json:"linked_accounts"`
}

// Email is the verified address Privy holds. Read it from here, never from the
// browser: a client-supplied email would let anyone claim anyone else's seat.
func (u User) Email() string {
	for _, a := range u.LinkedAccounts {
		if a.Type == "email" && a.Address != "" {
			return strings.ToLower(a.Address)
		}
		if a.Type == "google_oauth" && a.Email != "" {
			return strings.ToLower(a.Email)
		}
	}
	return ""
}

// EmbeddedWallet is the Privy-managed wallet that holds the user's quorum key.
func (u User) EmbeddedWallet() string {
	for _, a := range u.LinkedAccounts {
		if a.Type == "wallet" && a.WalletClientType == "privy" && a.Address != "" {
			return a.Address
		}
	}
	return ""
}

func (c *Client) User(ctx context.Context, userID string) (User, error) {
	var out User
	err := c.call(ctx, http.MethodGet, "/v1/users/"+userID, nil, &out, callOpts{})
	return out, err
}

func orDefault(v, fallback string) string {
	if v != "" {
		return v
	}
	return fallback
}
