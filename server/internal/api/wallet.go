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
		// A member's wallet has no key quorum over it; the treasury does.
		Unsigned: true,
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
