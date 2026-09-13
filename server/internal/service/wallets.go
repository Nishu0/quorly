package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/privy"
	"github.com/Nishu0/quorly/server/internal/store"
)

// Wallets gives every person on a roster somewhere to be paid.
//
// A member with no wallet is an invoice with nowhere to go: the payout reads
// the payee off the submitter, and an empty address stops the transfer at the
// last step, after the approval and the Selfie Check have already been spent.
type Wallets struct {
	DB    *store.Store
	Privy *privy.Client
	Log   *slog.Logger
}

// Ensure returns the member with a wallet attached, creating one if needed.
//
// Safe to call on every sign-in and every invite: the member row is only
// written when it has no wallet, and Privy is asked with the member id as the
// external id, so a retry after a half-finished attempt adopts the wallet the
// first one created rather than leaving an orphan behind.
func (w *Wallets) Ensure(ctx context.Context, m domain.Member) (domain.Member, error) {
	if m.WalletAddress != nil && *m.WalletAddress != "" {
		return m, nil
	}
	if w.Privy == nil {
		return m, nil // not configured; the demo path fills this in elsewhere
	}

	wallet, err := w.Privy.CreateWallet(ctx, privy.CreateWalletParams{
		ChainType:   "ethereum",
		DisplayName: m.Display(),
		ExternalID:  "member_" + m.ID,
	})
	if err != nil {
		return m, fmt.Errorf("create wallet for %s: %w", m.ID, err)
	}

	updated, err := w.DB.SetMemberWallet(ctx, m.ID, wallet.ID, wallet.Address)
	if errors.Is(err, store.ErrNotFound) {
		// Someone else got there first — theirs wins, since an address that
		// changes under a member is an invoice paid to a stranger.
		return w.DB.Member(ctx, m.ID)
	}
	if err != nil {
		return m, err
	}

	w.Log.Info("member wallet created", "member", m.ID, "address", wallet.Address)
	return updated, nil
}
