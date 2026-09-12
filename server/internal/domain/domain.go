// Package domain holds the entities the whole system agrees on.
package domain

import "time"

type Role string

const (
	RoleOwner    Role = "owner"    // edits policy and quorum membership
	RoleApprover Role = "approver" // approves within policy limits
	RoleFinance  Role = "finance"  // executes payouts, cannot approve
	RoleMember   Role = "member"   // submits invoices only
)

type InvoiceStatus string

const (
	StatusDraft           InvoiceStatus = "draft"
	StatusPendingApproval InvoiceStatus = "pending_approval"
	StatusApproved        InvoiceStatus = "approved"
	StatusRejected        InvoiceStatus = "rejected"
	StatusScheduled       InvoiceStatus = "scheduled"
	StatusPaid            InvoiceStatus = "paid"
	StatusFailed          InvoiceStatus = "failed"
)

type AttestationKind string

const (
	// SelfieCheck is medium assurance: liveness and facial similarity, valid
	// 90 days, with no one-person-one-account guarantee. It proves a live
	// human was present — never who they are.
	SelfieCheck  AttestationKind = "selfie_check"
	ProofOfHuman AttestationKind = "proof_of_human"
)

type Org struct {
	ID                 string
	Name               string
	SlackTeamID        *string
	ENSName            *string
	ENSRegistryAddress *string
	TreasuryWalletID   *string
	TreasuryAddress    *string
	TreasuryQuorumID   *string
	CreatedAt          time.Time
}

type Member struct {
	ID                 string
	OrgID              string
	Email              string
	Name               *string
	SlackUserID        *string
	Role               Role
	PrivyUserID        *string
	WalletID           *string
	WalletAddress      *string
	AuthorizationKeyID *string
	ENSSubname         *string
	WorldNullifier     *string
	CreatedAt          time.Time
}

func (m Member) Display() string {
	if m.Name != nil && *m.Name != "" {
		return *m.Name
	}
	return m.Email
}

// Policy is one tier of the org's rulebook.
type Policy struct {
	ID                   string
	OrgID                string
	Name                 string
	Active               bool
	MaxAmount            float64
	Currency             string
	RequiredApprovals    int
	ApproverRoles        []Role
	RequiredAttestation  *AttestationKind
	AttestationMaxAgeSec int
	BlockSelfApproval    bool
	PrivyPolicyID        *string
	CreatedAt            time.Time
}

type Invoice struct {
	ID                string
	OrgID             string
	SubmitterID       string
	Number            *string
	Description       *string
	Amount            float64
	Currency          string
	DueDate           *time.Time
	Status            InvoiceStatus
	PayeeAddress      *string
	PayeeENS          *string
	FileURL           *string
	PolicyID          *string
	RequiredApprovals int
	ExternalSystem    *string
	ExternalID        *string
	PrivyIntentID     *string
	TxHash            *string
	SlackChannelID    *string
	SlackThreadTS     *string
	CreatedAt         time.Time
	PaidAt            *time.Time
}

type Approval struct {
	ID            string
	InvoiceID     string
	ApproverID    string
	Decision      string // approve | reject
	Note          *string
	AttestationID *string
	CreatedAt     time.Time
}

type Attestation struct {
	ID                string
	OrgID             string
	MemberID          *string
	Kind              AttestationKind
	Action            string
	Signal            string
	Nullifier         string
	VerificationLevel *string
	CreatedAt         time.Time
	ExpiresAt         *time.Time
}

// Challenge is a server-issued World ID nonce, bound to one invoice and one
// approver and spendable exactly once.
type Challenge struct {
	Nonce      string
	OrgID      string
	InvoiceID  string
	MemberID   string
	Action     string
	Signal     string
	CreatedAt  time.Time
	ExpiresAt  time.Time
	ConsumedAt *time.Time
}

// SlackInstallation is one workspace that installed the app.
type SlackInstallation struct {
	TeamID      string
	TeamName    string
	OrgID       string
	BotToken    string
	BotUserID   string
	InstalledBy string
	Scopes      string
	CreatedAt   time.Time
}
