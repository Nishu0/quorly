package privy

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
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
		signedHeaders := map[string]any{}
		if opts.idempotencyKey != "" {
			signedHeaders["privy-idempotency-key"] = opts.idempotencyKey
		}
		sigs := make([]string, 0, len(c.AuthKeys))
		for _, key := range c.AuthKeys {
			signBody := body
			if signBody == nil {
				signBody = map[string]any{}
			}
			sig, err := AuthorizationSignature(method, url, signBody, c.AppID, key, signedHeaders)
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

/* ------------------------------------------------------------------ payouts */

func (c *Client) SendTransaction(ctx context.Context, p SendParams) (string, error) {
	body := map[string]any{
		"caip2":  p.CAIP2,
		"method": "eth_sendTransaction",
		"params": map[string]any{"transaction": map[string]any{
			"to":    p.To,
			"value": "0x0",
			"data":  p.Data,
		}},
	}

	var out struct {
		Data struct {
			Hash          string `json:"hash"`
			TransactionID string `json:"transaction_id"`
		} `json:"data"`
	}
	if err := c.call(ctx, http.MethodPost, "/v1/wallets/"+p.WalletID+"/rpc",
		body, &out, callOpts{sign: !p.Unsigned, idempotencyKey: p.IdempotencyKey}); err != nil {
		return "", err
	}
	if out.Data.Hash == "" {
		return "", fmt.Errorf("privy broadcast from %s but returned no hash", p.WalletID)
	}
	return out.Data.Hash, nil
}

type SendParams struct {
	WalletID string
	CAIP2    string
	To       string
	Data     string
	// Unsigned marks a wallet the app controls outright, with no key quorum to
	// satisfy. Member wallets are like this; the treasury is not.
	Unsigned bool
	// IdempotencyKey stops a retried job from paying twice. It is signed along
	// with the rest of the request, so it cannot be swapped in transit.
	IdempotencyKey string
}

// ERC20TransferData builds calldata for transfer(address,uint256). The amount
// is in the token's base units, which is what the contract expects — unlike
// Privy's transfer intents, nothing here rescales it for us.
func ERC20TransferData(to string, amount *big.Int) string {
	addr := strings.TrimPrefix(strings.ToLower(to), "0x")
	return "0xa9059cbb" +
		fmt.Sprintf("%064s", addr) +
		fmt.Sprintf("%064s", amount.Text(16))
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
