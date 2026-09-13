package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Nishu0/quorly/server/internal/auth"
	"github.com/Nishu0/quorly/server/internal/money"
	"github.com/Nishu0/quorly/server/internal/privy"
)

// getWallet returns the address the member is paid into, creating one if they
// somehow reached this page without it. Balances are read in the browser
// against the same RPC the rest of the dashboard uses — the server has no
// business proxying a public view call.
func (s *Server) getWallet(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}

	if s.Wallets != nil {
		if funded, err := s.Wallets.Ensure(r.Context(), m); err != nil {
			s.Log.Warn("wallet provisioning", "err", err, "member", m.ID)
		} else {
			m = funded
		}
	}

	address := ""
	if m.WalletAddress != nil {
		address = *m.WalletAddress
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"address": address,
		"token":   s.Cfg.Chain.SettlementToken,
		"symbol":  "QUSD",
	})
}

// sendFromWallet moves the member's own tokens.
//
// Deliberately not the payout path: no policy, no quorum, no Selfie Check.
// This is a person spending what they were paid, not the company releasing
// funds, and conflating the two would put company money behind a single click.
func (s *Server) sendFromWallet(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	if m.WalletID == nil || *m.WalletID == "" {
		writeErr(w, http.StatusBadRequest, "You don't have a wallet yet — reload and try again.")
		return
	}

	var body struct {
		To     string `json:"to"`
		Amount string `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}

	to := strings.TrimSpace(body.To)
	if !isAddress(to) {
		writeErr(w, http.StatusBadRequest, "That isn't a valid wallet address.")
		return
	}
	amount, err := money.ToBaseUnits(strings.TrimSpace(body.Amount))
	if err != nil || amount.Sign() <= 0 {
		writeErr(w, http.StatusBadRequest, "Enter an amount greater than zero.")
		return
	}

	hash, err := s.Privy.SendTransaction(r.Context(), privy.SendParams{
		WalletID: *m.WalletID,
		CAIP2:    money.CAIP2(s.Cfg.Chain.ID),
		To:       s.Cfg.Chain.SettlementToken,
		Data:     privy.ERC20TransferData(to, amount),
	})
	if err != nil {
		s.Log.Error("wallet send", "err", err, "member", m.ID)
		writeErr(w, http.StatusBadGateway,
			"That didn't go through. A new wallet holds no ETH, and without gas it can "+
				"receive but not spend — fund the address first.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"hash": hash})
}

func isAddress(s string) bool {
	if len(s) != 42 || !strings.HasPrefix(s, "0x") {
		return false
	}
	for _, c := range s[2:] {
		if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
			return false
		}
	}
	return true
}

// exportWallet hands back the member's own key, encrypted to a public key the
// browser generated for this one request.
//
// The server is a courier here and nothing more: it never holds the plaintext
// key, cannot decrypt what it forwards, and logs none of it. That is the whole
// reason the recipient keypair belongs in the browser rather than here.
func (s *Server) exportWallet(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	if m.WalletID == nil || *m.WalletID == "" {
		writeErr(w, http.StatusBadRequest, "You don't have a wallet to export.")
		return
	}

	var body struct {
		RecipientPublicKey string `json:"recipientPublicKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if strings.TrimSpace(body.RecipientPublicKey) == "" {
		writeErr(w, http.StatusBadRequest, "missing recipient key")
		return
	}

	// Only ever the caller's own wallet: the id comes from the session, never
	// from the request, so no one can name somebody else's wallet here.
	out, err := s.Privy.ExportWallet(r.Context(), *m.WalletID, body.RecipientPublicKey)
	if err != nil {
		// Deliberately terse: an upstream error on this path should not echo
		// anything about key material back to the browser.
		s.Log.Error("wallet export", "err", err, "member", m.ID)
		writeErr(w, http.StatusBadGateway, "Couldn't export the key. Try again.")
		return
	}
	s.Log.Info("wallet key exported", "member", m.ID)

	writeJSON(w, http.StatusOK, map[string]any{
		"ciphertext":      out.Ciphertext,
		"encapsulatedKey": out.EncapsulatedKey,
	})
}
