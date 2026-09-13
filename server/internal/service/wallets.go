package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"sort"

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

	// TokenAddress and MaxPayoutBase mirror the treasury policy, so a rebuilt
	// allowlist keeps the other conditions it was created with.
	TokenAddress  string
	MaxPayoutBase *big.Int
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

	// The treasury policy allowlists payees, so a wallet nobody has told it
	// about cannot be paid: the enclave refuses the transfer after the
	// approval and the Selfie Check have already been spent. Best-effort —
	// the member still has an address, and the next Ensure tries again.
	if err := w.SyncPayeeAllowlist(ctx, m.OrgID); err != nil {
		w.Log.Warn("payee allowlist", "err", err, "org", m.OrgID)
	}
	return updated, nil
}

// SyncPayeeAllowlist rebuilds the treasury policy from the current roster.
//
// The allowlist is derived rather than accumulated: every member wallet in the
// org, and nothing else. A list that only ever grows would keep paying people
// who have left, which is the failure a spend policy exists to prevent.
func (w *Wallets) SyncPayeeAllowlist(ctx context.Context, orgID string) error {
	org, err := w.DB.Org(ctx, orgID)
	if err != nil {
		return err
	}
	if org.TreasuryWalletID == nil || *org.TreasuryWalletID == "" {
		return nil
	}

	treasury, err := w.Privy.Wallet(ctx, *org.TreasuryWalletID)
	if err != nil {
		return err
	}
	if len(treasury.PolicyIDs) == 0 {
		return nil // no policy to keep in step with
	}

	members, err := w.DB.Members(ctx, orgID)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	recipients := make([]string, 0, len(members))
	for _, m := range members {
		if m.WalletAddress == nil || *m.WalletAddress == "" || seen[*m.WalletAddress] {
			continue
		}
		seen[*m.WalletAddress] = true
		recipients = append(recipients, *m.WalletAddress)
	}
	if len(recipients) == 0 {
		// An empty `in` list denies everything. Leaving the policy as it stands
		// is the safer half of a bad choice.
		return nil
	}
	sort.Strings(recipients)

	// nil leaves the cap off rather than setting it to zero, which would deny
	// every payout.
	var max *big.Int
	if w.MaxPayoutBase != nil {
		max = new(big.Int).Set(w.MaxPayoutBase)
	}
	rules := privy.TreasuryRules(privy.TreasuryRulesParams{
		TokenAddress:      w.TokenAddress,
		MaxAmountBase:     max,
		AllowedRecipients: recipients,
	})
	if err := w.Privy.SetPolicyRules(ctx, treasury.PolicyIDs[0], rules); err != nil {
		return err
	}
	w.Log.Info("payee allowlist synced", "org", orgID, "payees", len(recipients))
	return nil
}
