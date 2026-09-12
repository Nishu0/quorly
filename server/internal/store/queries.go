package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Nishu0/quorly/server/internal/domain"
)

var ErrNotFound = errors.New("not found")

/* --------------------------------------------------------------------- orgs */

const orgCols = `id, name, slack_team_id, ens_name, ens_registry_address,
	treasury_wallet_id, treasury_address, treasury_quorum_id, created_at`

func scanOrg(row pgx.Row) (domain.Org, error) {
	var o domain.Org
	err := row.Scan(&o.ID, &o.Name, &o.SlackTeamID, &o.ENSName, &o.ENSRegistryAddress,
		&o.TreasuryWalletID, &o.TreasuryAddress, &o.TreasuryQuorumID, &o.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return o, ErrNotFound
	}
	return o, err
}

func (s *Store) Org(ctx context.Context, id string) (domain.Org, error) {
	return scanOrg(s.pool.QueryRow(ctx, `SELECT `+orgCols+` FROM orgs WHERE id=$1`, id))
}

func (s *Store) OrgBySlackTeam(ctx context.Context, teamID string) (domain.Org, error) {
	return scanOrg(s.pool.QueryRow(ctx, `SELECT `+orgCols+` FROM orgs WHERE slack_team_id=$1`, teamID))
}

func (s *Store) CreateOrg(ctx context.Context, tx pgx.Tx, o domain.Org) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO orgs (id, name, slack_team_id, ens_name)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (id) DO NOTHING`,
		o.ID, o.Name, o.SlackTeamID, o.ENSName)
	return err
}

func (s *Store) SetTreasury(ctx context.Context, orgID, walletID, address, quorumID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE orgs SET treasury_wallet_id=$2, treasury_address=$3, treasury_quorum_id=$4
		WHERE id=$1`, orgID, walletID, address, quorumID)
	return err
}

/* ------------------------------------------------------------------ members */

const memberCols = `id, org_id, email, name, slack_user_id, role, privy_user_id,
	wallet_id, wallet_address, authorization_key_id, ens_subname, world_nullifier,
	created_at, invited_by, invited_at`

func scanMember(row pgx.Row) (domain.Member, error) {
	var m domain.Member
	err := row.Scan(&m.ID, &m.OrgID, &m.Email, &m.Name, &m.SlackUserID, &m.Role,
		&m.PrivyUserID, &m.WalletID, &m.WalletAddress, &m.AuthorizationKeyID,
		&m.ENSSubname, &m.WorldNullifier, &m.CreatedAt, &m.InvitedBy, &m.InvitedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

func (s *Store) Member(ctx context.Context, id string) (domain.Member, error) {
	return scanMember(s.pool.QueryRow(ctx, `SELECT `+memberCols+` FROM members WHERE id=$1`, id))
}

func (s *Store) MemberByPrivyID(ctx context.Context, privyUserID string) (domain.Member, error) {
	return scanMember(s.pool.QueryRow(ctx,
		`SELECT `+memberCols+` FROM members WHERE privy_user_id=$1`, privyUserID))
}

func (s *Store) MemberBySlackID(ctx context.Context, slackUserID string) (domain.Member, error) {
	return scanMember(s.pool.QueryRow(ctx,
		`SELECT `+memberCols+` FROM members WHERE slack_user_id=$1`, slackUserID))
}

func (s *Store) Members(ctx context.Context, orgID string) ([]domain.Member, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+memberCols+` FROM members WHERE org_id=$1 ORDER BY created_at`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Member
	for rows.Next() {
		m, err := scanMember(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// UpsertMember matches on (org, email) so re-syncing a Slack workspace updates
// people rather than duplicating them.
func (s *Store) UpsertMember(ctx context.Context, tx pgx.Tx, m domain.Member) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO members (id, org_id, email, name, slack_user_id, role, ens_subname)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (org_id, email) DO UPDATE SET
			name          = COALESCE(EXCLUDED.name, members.name),
			slack_user_id = COALESCE(EXCLUDED.slack_user_id, members.slack_user_id)`,
		m.ID, m.OrgID, m.Email, m.Name, m.SlackUserID, string(m.Role), m.ENSSubname)
	return err
}

// ClaimMemberSeat links a verified Privy identity to the row invited for that
// email — but only if nobody holds it yet, so a seat can't be stolen.
//
// One address can sit on several rosters (members is unique per org+email), but
// members_privy_idx is unique on privy_user_id across every org, so exactly one
// of those seats can be claimed. Picking one row explicitly is what keeps that
// legal: an unscoped UPDATE matches every roster the address appears on and
// tries to write the same DID to all of them, which trips the index and locks
// the person out of signing in at all. Their most privileged seat wins, oldest
// breaking the tie, and FOR UPDATE keeps two concurrent sign-ins off one row.
func (s *Store) ClaimMemberSeat(ctx context.Context, email, privyUserID string, walletAddress *string) (domain.Member, error) {
	return scanMember(s.pool.QueryRow(ctx, `
		WITH seat AS (
			SELECT id AS seat_id FROM members
			WHERE lower(email)=lower($1) AND privy_user_id IS NULL
			ORDER BY CASE role
				WHEN 'owner' THEN 0
				WHEN 'approver' THEN 1
				ELSE 2
			END, created_at, id
			LIMIT 1
			FOR UPDATE
		)
		UPDATE members m SET privy_user_id=$2, wallet_address=COALESCE($3, m.wallet_address)
		FROM seat WHERE m.id = seat.seat_id
		RETURNING `+memberCols, email, privyUserID, walletAddress))
}

func (s *Store) SetMemberRole(ctx context.Context, memberID string, role domain.Role) error {
	_, err := s.pool.Exec(ctx, `UPDATE members SET role=$2 WHERE id=$1`, memberID, string(role))
	return err
}

/* ----------------------------------------------------------------- policies */

func (s *Store) Policies(ctx context.Context, orgID string) ([]domain.Policy, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, org_id, name, active, max_amount::text, currency, required_approvals,
		       approver_roles, required_attestation, attestation_max_age_sec,
		       block_self_approval, privy_policy_id, created_at, updated_at, updated_by
		FROM policies WHERE org_id=$1 ORDER BY max_amount`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Policy
	for rows.Next() {
		var (
			p         domain.Policy
			amountStr string
			rolesRaw  []byte
			attest    *string
		)
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Active, &amountStr, &p.Currency,
			&p.RequiredApprovals, &rolesRaw, &attest, &p.AttestationMaxAgeSec,
			&p.BlockSelfApproval, &p.PrivyPolicyID, &p.CreatedAt,
			&p.UpdatedAt, &p.UpdatedBy); err != nil {
			return nil, err
		}

		p.MaxAmount, err = strconv.ParseFloat(amountStr, 64)
		if err != nil {
			return nil, fmt.Errorf("policy %s has an unparseable ceiling %q: %w", p.ID, amountStr, err)
		}

		var roles []string
		if err := json.Unmarshal(rolesRaw, &roles); err != nil {
			return nil, err
		}
		for _, r := range roles {
			p.ApproverRoles = append(p.ApproverRoles, domain.Role(r))
		}

		if attest != nil {
			k := domain.AttestationKind(*attest)
			p.RequiredAttestation = &k
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) CreatePolicy(ctx context.Context, tx pgx.Tx, p domain.Policy) error {
	roles := make([]string, 0, len(p.ApproverRoles))
	for _, r := range p.ApproverRoles {
		roles = append(roles, string(r))
	}
	rolesJSON, err := json.Marshal(roles)
	if err != nil {
		return err
	}

	var attest *string
	if p.RequiredAttestation != nil {
		v := string(*p.RequiredAttestation)
		attest = &v
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO policies (id, org_id, name, active, max_amount, currency,
			required_approvals, approver_roles, required_attestation,
			attestation_max_age_sec, block_self_approval)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (id) DO NOTHING`,
		p.ID, p.OrgID, p.Name, p.Active, strconv.FormatFloat(p.MaxAmount, 'f', -1, 64),
		p.Currency, p.RequiredApprovals, rolesJSON, attest,
		p.AttestationMaxAgeSec, p.BlockSelfApproval)
	return err
}

func (s *Store) SetPolicyPrivyID(ctx context.Context, orgID, privyPolicyID string) error {
	_, err := s.pool.Exec(ctx, `UPDATE policies SET privy_policy_id=$2 WHERE org_id=$1`, orgID, privyPolicyID)
	return err
}

/* ----------------------------------------------------------------- invoices */

const invoiceCols = `id, org_id, submitter_id, number, description, amount::text, currency,
	due_date, status, payee_address, payee_ens, file_url, policy_id, required_approvals,
	external_system, external_id, privy_intent_id, tx_hash, slack_channel_id,
	slack_thread_ts, created_at, paid_at`

func scanInvoice(row pgx.Row) (domain.Invoice, error) {
	var (
		i         domain.Invoice
		amountStr string
	)
	err := row.Scan(&i.ID, &i.OrgID, &i.SubmitterID, &i.Number, &i.Description, &amountStr,
		&i.Currency, &i.DueDate, &i.Status, &i.PayeeAddress, &i.PayeeENS, &i.FileURL,
		&i.PolicyID, &i.RequiredApprovals, &i.ExternalSystem, &i.ExternalID,
		&i.PrivyIntentID, &i.TxHash, &i.SlackChannelID, &i.SlackThreadTS,
		&i.CreatedAt, &i.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return i, ErrNotFound
	}
	if err != nil {
		return i, err
	}
	i.Amount, err = strconv.ParseFloat(amountStr, 64)
	return i, err
}

func (s *Store) Invoice(ctx context.Context, id string) (domain.Invoice, error) {
	return scanInvoice(s.pool.QueryRow(ctx, `SELECT `+invoiceCols+` FROM invoices WHERE id=$1`, id))
}

func (s *Store) Invoices(ctx context.Context, orgID string, limit int) ([]domain.Invoice, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+invoiceCols+` FROM invoices WHERE org_id=$1 ORDER BY created_at DESC LIMIT $2`, orgID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Invoice
	for rows.Next() {
		i, err := scanInvoice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (s *Store) CreateInvoice(ctx context.Context, tx pgx.Tx, i domain.Invoice) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO invoices (id, org_id, submitter_id, number, description, amount,
			currency, due_date, status, payee_address, payee_ens, file_url,
			policy_id, required_approvals, slack_channel_id, slack_thread_ts)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		i.ID, i.OrgID, i.SubmitterID, i.Number, i.Description,
		strconv.FormatFloat(i.Amount, 'f', -1, 64), i.Currency, i.DueDate, string(i.Status),
		i.PayeeAddress, i.PayeeENS, i.FileURL, i.PolicyID, i.RequiredApprovals,
		i.SlackChannelID, i.SlackThreadTS)
	return err
}

func (s *Store) SetInvoiceStatus(ctx context.Context, tx pgx.Tx, id string, status domain.InvoiceStatus) error {
	_, err := tx.Exec(ctx, `UPDATE invoices SET status=$2 WHERE id=$1`, id, string(status))
	return err
}

func (s *Store) SetInvoiceIntent(ctx context.Context, id, intentID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE invoices SET privy_intent_id=$2, status='scheduled' WHERE id=$1`, id, intentID)
	return err
}

func (s *Store) MarkInvoicePaid(ctx context.Context, id, txHash string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE invoices SET status='paid', tx_hash=$2, paid_at=now() WHERE id=$1`, id, txHash)
	return err
}

/* ---------------------------------------------------------------- approvals */

func (s *Store) Approvals(ctx context.Context, invoiceID string) ([]domain.Approval, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, invoice_id, approver_id, decision, note, attestation_id, created_at
		FROM approvals WHERE invoice_id=$1 ORDER BY created_at`, invoiceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Approval
	for rows.Next() {
		var a domain.Approval
		if err := rows.Scan(&a.ID, &a.InvoiceID, &a.ApproverID, &a.Decision,
			&a.Note, &a.AttestationID, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) RecordApproval(ctx context.Context, tx pgx.Tx, a domain.Approval) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO approvals (id, invoice_id, approver_id, decision, note, attestation_id)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		a.ID, a.InvoiceID, a.ApproverID, a.Decision, a.Note, a.AttestationID)
	return err
}

// CountApprovals reads inside the caller's transaction so the quorum tally and
// the status flip can't interleave with a concurrent approval.
func CountApprovals(ctx context.Context, tx pgx.Tx, invoiceID string) (int, error) {
	var n int
	err := tx.QueryRow(ctx,
		`SELECT count(*) FROM approvals WHERE invoice_id=$1 AND decision='approve'`, invoiceID).Scan(&n)
	return n, err
}

func HasDecided(ctx context.Context, tx pgx.Tx, invoiceID, approverID string) (bool, error) {
	var ok bool
	err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM approvals WHERE invoice_id=$1 AND approver_id=$2)`,
		invoiceID, approverID).Scan(&ok)
	return ok, err
}

/* ------------------------------------------------------------- attestations */

func (s *Store) RecordAttestation(ctx context.Context, a domain.Attestation, raw []byte) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO attestations (id, org_id, member_id, kind, action, signal,
			nullifier, verification_level, raw)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		a.ID, a.OrgID, a.MemberID, string(a.Kind), a.Action, a.Signal,
		a.Nullifier, a.VerificationLevel, raw)
	return err
}

// FreshAttestationAge returns how old the approver's proof for this invoice is,
// or nil when there isn't one inside the window.
func (s *Store) FreshAttestationAge(ctx context.Context, memberID, signal string, maxAge time.Duration) (*int, error) {
	var created time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT created_at FROM attestations
		WHERE member_id=$1 AND signal=$2 AND created_at >= now() - $3::interval
		ORDER BY created_at DESC LIMIT 1`,
		memberID, signal, fmt.Sprintf("%d seconds", int(maxAge.Seconds()))).Scan(&created)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	age := int(time.Since(created).Seconds())
	return &age, nil
}

/* --------------------------------------------------------------- challenges */

func (s *Store) CreateChallenge(ctx context.Context, c domain.Challenge) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO world_challenges (nonce, org_id, invoice_id, member_id, action, signal, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		c.Nonce, c.OrgID, c.InvoiceID, c.MemberID, c.Action, c.Signal, c.ExpiresAt)
	return err
}

// ConsumeChallenge burns the nonce and returns what it was bound to.
//
// The UPDATE ... WHERE consumed_at IS NULL is the whole race defence: two
// concurrent submissions of the same proof, only one row updated.
func (s *Store) ConsumeChallenge(ctx context.Context, nonce string) (domain.Challenge, error) {
	var c domain.Challenge
	err := s.pool.QueryRow(ctx, `
		UPDATE world_challenges SET consumed_at = now()
		WHERE nonce=$1 AND consumed_at IS NULL AND expires_at > now()
		RETURNING nonce, org_id, invoice_id, member_id, action, signal, created_at, expires_at, consumed_at`,
		nonce).Scan(&c.Nonce, &c.OrgID, &c.InvoiceID, &c.MemberID, &c.Action,
		&c.Signal, &c.CreatedAt, &c.ExpiresAt, &c.ConsumedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

/* ---------------------------------------------------------------- audit log */

func (s *Store) Audit(ctx context.Context, tx pgx.Tx, id, orgID string, actorID *string, subject, event string, data any) error {
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO audit_log (id, org_id, actor_id, subject, event, data)
		VALUES ($1,$2,$3,$4,$5,$6)`, id, orgID, actorID, subject, event, body)
	return err
}

type AuditEntry struct {
	ID        string          `json:"id"`
	ActorID   *string         `json:"actorId"`
	Subject   string          `json:"subject"`
	Event     string          `json:"event"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"createdAt"`
}

func (s *Store) AuditTrail(ctx context.Context, subject string) ([]AuditEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, actor_id, subject, event, data, created_at
		FROM audit_log WHERE subject=$1 ORDER BY created_at DESC`, subject)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AuditEntry
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.ActorID, &e.Subject, &e.Event, &e.Data, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

/* ------------------------------------------------------ slack installations */

func (s *Store) SaveInstallation(ctx context.Context, tx pgx.Tx, in domain.SlackInstallation) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO slack_installations (team_id, team_name, org_id, bot_token, bot_user_id, installed_by, scopes)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (team_id) DO UPDATE SET
			team_name    = EXCLUDED.team_name,
			bot_token    = EXCLUDED.bot_token,
			bot_user_id  = EXCLUDED.bot_user_id,
			installed_by = EXCLUDED.installed_by,
			scopes       = EXCLUDED.scopes,
			updated_at   = now()`,
		in.TeamID, in.TeamName, in.OrgID, in.BotToken, in.BotUserID, in.InstalledBy, in.Scopes)
	return err
}

func (s *Store) Installation(ctx context.Context, teamID string) (domain.SlackInstallation, error) {
	var in domain.SlackInstallation
	err := s.pool.QueryRow(ctx, `
		SELECT team_id, team_name, org_id, bot_token, bot_user_id, installed_by, scopes, created_at
		FROM slack_installations WHERE team_id=$1`, teamID).
		Scan(&in.TeamID, &in.TeamName, &in.OrgID, &in.BotToken, &in.BotUserID,
			&in.InstalledBy, &in.Scopes, &in.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return in, ErrNotFound
	}
	return in, err
}

/* ------------------------------------------------------- policy management */

// UpdatePolicy writes the fields an owner can change and stamps who did it.
// Everything else about a tier — its id, its org — is not editable by design.
func (s *Store) UpdatePolicy(ctx context.Context, p domain.Policy, actorID string) error {
	roles := make([]string, 0, len(p.ApproverRoles))
	for _, r := range p.ApproverRoles {
		roles = append(roles, string(r))
	}
	rolesJSON, err := json.Marshal(roles)
	if err != nil {
		return err
	}

	var attest *string
	if p.RequiredAttestation != nil {
		v := string(*p.RequiredAttestation)
		attest = &v
	}

	tag, err := s.pool.Exec(ctx, `
		UPDATE policies SET
			name = $3, active = $4, max_amount = $5, required_approvals = $6,
			approver_roles = $7, required_attestation = $8,
			attestation_max_age_sec = $9, block_self_approval = $10,
			updated_at = now(), updated_by = $11
		WHERE id = $1 AND org_id = $2`,
		p.ID, p.OrgID, p.Name, p.Active,
		strconv.FormatFloat(p.MaxAmount, 'f', -1, 64), p.RequiredApprovals,
		rolesJSON, attest, p.AttestationMaxAgeSec, p.BlockSelfApproval, actorID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeletePolicy refuses to remove the last active tier: an org with no tiers has
// no way to route an invoice, and every submission would fail at the gate.
func (s *Store) DeletePolicy(ctx context.Context, orgID, policyID string) error {
	return s.Tx(ctx, func(tx pgx.Tx) error {
		var remaining int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM policies WHERE org_id=$1 AND id <> $2 AND active`,
			orgID, policyID).Scan(&remaining); err != nil {
			return err
		}
		if remaining == 0 {
			return ErrLastPolicy
		}

		tag, err := tx.Exec(ctx, `DELETE FROM policies WHERE id=$1 AND org_id=$2`, policyID, orgID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

var (
	ErrLastPolicy      = errors.New("an org needs at least one active policy tier")
	ErrPolicyInUse     = errors.New("policy is referenced by an invoice")
	ErrAlreadyOnRoster = errors.New("that email is already on the roster")
)

/* ------------------------------------------------------- member management */

// InviteMember adds someone by email. They claim the seat by signing in, which
// is why the row exists before they ever have.
func (s *Store) InviteMember(ctx context.Context, m domain.Member, actorID string) (domain.Member, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO members (id, org_id, email, name, role, invited_by, invited_at)
		VALUES ($1,$2,lower($3),$4,$5,$6, now())
		ON CONFLICT (org_id, email) DO NOTHING
		RETURNING `+memberCols,
		m.ID, m.OrgID, m.Email, m.Name, string(m.Role), actorID)

	member, err := scanMember(row)
	if errors.Is(err, ErrNotFound) {
		return domain.Member{}, ErrAlreadyOnRoster
	}
	return member, err
}

// RemoveMember deletes a seat. Invoices they submitted keep their reference, so
// the audit trail stays intact — the database refuses the delete if so.
func (s *Store) RemoveMember(ctx context.Context, orgID, memberID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM members WHERE id=$1 AND org_id=$2`, memberID, orgID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetRole changes what someone may do. Scoped by org so a member id from
// another tenant can't be targeted.
func (s *Store) SetRole(ctx context.Context, orgID, memberID string, role domain.Role) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE members SET role=$3 WHERE id=$1 AND org_id=$2`, memberID, orgID, string(role))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountOwners guards the last-owner case: an org with no owner can never have
// its policy changed again.
func (s *Store) CountOwners(ctx context.Context, orgID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM members WHERE org_id=$1 AND role='owner'`, orgID).Scan(&n)
	return n, err
}
