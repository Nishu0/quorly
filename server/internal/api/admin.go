package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/Nishu0/quorly/server/internal/auth"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/ids"
	"github.com/Nishu0/quorly/server/internal/store"
)

// requireOwner gates everything that changes who can spend what. Anyone signed
// in can read the policy; only an owner can move the lines.
func (s *Server) requireOwner(w http.ResponseWriter, r *http.Request) (domain.Member, bool) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return domain.Member{}, false
	}
	if m.Role != domain.RoleOwner {
		writeErr(w, http.StatusForbidden, "Only an owner can change this.")
		return domain.Member{}, false
	}
	return m, true
}

/* ------------------------------------------------------------- policy CRUD */

type policyBody struct {
	Name                 string   `json:"name"`
	MaxAmount            float64  `json:"maxAmount"`
	RequiredApprovals    int      `json:"requiredApprovals"`
	ApproverRoles        []string `json:"approverRoles"`
	RequireSelfieCheck   bool     `json:"requireSelfieCheck"`
	AttestationMaxAgeSec int      `json:"attestationMaxAgeSec"`
	BlockSelfApproval    bool     `json:"blockSelfApproval"`
	Active               bool     `json:"active"`
}

func (b policyBody) validate() error {
	if strings.TrimSpace(b.Name) == "" {
		return errors.New("a tier needs a name")
	}
	if b.MaxAmount <= 0 {
		return errors.New("the ceiling must be above zero")
	}
	if b.RequiredApprovals < 1 {
		return errors.New("at least one approval is required")
	}
	if len(b.ApproverRoles) == 0 {
		return errors.New("pick at least one role that may approve")
	}
	// A zero window would expire every proof the instant it was issued.
	if b.RequireSelfieCheck && b.AttestationMaxAgeSec < 30 {
		return errors.New("the Selfie Check window must be at least 30 seconds")
	}
	return nil
}

func (b policyBody) toDomain(orgID, id string) domain.Policy {
	roles := make([]domain.Role, 0, len(b.ApproverRoles))
	for _, r := range b.ApproverRoles {
		roles = append(roles, domain.Role(r))
	}

	var attest *domain.AttestationKind
	if b.RequireSelfieCheck {
		k := domain.SelfieCheck
		attest = &k
	}

	age := b.AttestationMaxAgeSec
	if age == 0 {
		age = 300
	}

	return domain.Policy{
		ID: id, OrgID: orgID, Name: strings.TrimSpace(b.Name), Active: b.Active,
		MaxAmount: b.MaxAmount, Currency: "QUSD",
		RequiredApprovals: b.RequiredApprovals, ApproverRoles: roles,
		RequiredAttestation: attest, AttestationMaxAgeSec: age,
		BlockSelfApproval: b.BlockSelfApproval,
	}
}

func (s *Server) createPolicy(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.requireOwner(w, r)
	if !ok {
		return
	}

	var body policyBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if err := body.validate(); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	p := body.toDomain(owner.OrgID, ids.New("pol"))
	if err := s.DB.Tx(r.Context(), func(tx pgx.Tx) error {
		return s.DB.CreatePolicy(r.Context(), tx, p)
	}); err != nil {
		s.fail(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": p.ID})
}

func (s *Server) updatePolicy(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.requireOwner(w, r)
	if !ok {
		return
	}

	var body policyBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if err := body.validate(); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	p := body.toDomain(owner.OrgID, r.PathValue("id"))
	if err := s.DB.UpdatePolicy(r.Context(), p, owner.ID); err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) deletePolicy(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.requireOwner(w, r)
	if !ok {
		return
	}

	err := s.DB.DeletePolicy(r.Context(), owner.OrgID, r.PathValue("id"))
	switch {
	case errors.Is(err, store.ErrLastPolicy):
		writeErr(w, http.StatusConflict,
			"This is the last active tier. Without one, no invoice could be routed.")
	case err != nil:
		s.fail(w, err)
	default:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

/* ------------------------------------------------------- member management */

func (s *Server) inviteMember(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.requireOwner(w, r)
	if !ok {
		return
	}

	var body struct {
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !strings.Contains(email, "@") {
		writeErr(w, http.StatusBadRequest, "That doesn't look like an email address.")
		return
	}
	if !validRole(body.Role) {
		writeErr(w, http.StatusBadRequest, "Unknown role.")
		return
	}

	var name *string
	if n := strings.TrimSpace(body.Name); n != "" {
		name = &n
	}

	member, err := s.DB.InviteMember(r.Context(), domain.Member{
		ID: ids.New("mem"), OrgID: owner.OrgID, Email: email,
		Name: name, Role: domain.Role(body.Role),
	}, owner.ID)

	switch {
	case errors.Is(err, store.ErrAlreadyOnRoster):
		writeErr(w, http.StatusConflict, email+" is already on the roster.")
	case err != nil:
		s.fail(w, err)
	default:
		// Give them somewhere to be paid before they ever sign in, so an
		// invoice filed on their behalf has a destination.
		if s.Wallets != nil {
			if funded, err := s.Wallets.Ensure(r.Context(), member); err != nil {
				s.Log.Warn("wallet provisioning", "err", err, "member", member.ID)
			} else {
				member = funded
			}
		}
		writeJSON(w, http.StatusCreated, memberView(member))
	}
}

func (s *Server) setMemberRole(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.requireOwner(w, r)
	if !ok {
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if !validRole(body.Role) {
		writeErr(w, http.StatusBadRequest, "Unknown role.")
		return
	}

	target := r.PathValue("id")

	// Demoting the last owner would leave nobody able to change policy again.
	if target == owner.ID && body.Role != string(domain.RoleOwner) {
		n, err := s.DB.CountOwners(r.Context(), owner.OrgID)
		if err != nil {
			s.fail(w, err)
			return
		}
		if n <= 1 {
			writeErr(w, http.StatusConflict,
				"You're the only owner. Promote someone else before changing your own role.")
			return
		}
	}

	if err := s.DB.SetRole(r.Context(), owner.OrgID, target, domain.Role(body.Role)); err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.requireOwner(w, r)
	if !ok {
		return
	}

	target := r.PathValue("id")
	if target == owner.ID {
		writeErr(w, http.StatusConflict, "You can't remove yourself.")
		return
	}

	if err := s.DB.RemoveMember(r.Context(), owner.OrgID, target); err != nil {
		// A member who has submitted or approved anything is referenced by rows
		// that must not lose their author.
		if strings.Contains(err.Error(), "violates foreign key") {
			writeErr(w, http.StatusConflict,
				"They've already submitted or approved an invoice, so the audit trail needs them. Change their role to member instead.")
			return
		}
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func validRole(r string) bool {
	switch domain.Role(r) {
	case domain.RoleOwner, domain.RoleApprover, domain.RoleFinance, domain.RoleMember:
		return true
	}
	return false
}
