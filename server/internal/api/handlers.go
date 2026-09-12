package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/Nishu0/quorly/server/internal/auth"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/service"
	"github.com/Nishu0/quorly/server/internal/store"
	"github.com/Nishu0/quorly/server/internal/worldid"
)

/* ------------------------------------------------------------------ health */

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	stats, err := s.Queue.Stats(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"ok": false, "database": "unreachable",
		})
		return
	}
	// Dead jobs are surfaced here on purpose: a queue that is quietly
	// dead-lettering payouts is the failure an operator most needs to see.
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "demo": s.Cfg.Demo(), "queue": stats,
	})
}

/* -------------------------------------------------------------------- auth */

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, memberView(m))
}

// authSync links a freshly signed-in Privy user to their seat on the roster.
func (s *Server) authSync(w http.ResponseWriter, r *http.Request) {
	sub, err := s.Verifier.UserID(r.Context(), auth.TokenFrom(r))
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "not signed in")
		return
	}

	if m, err := s.DB.MemberByPrivyID(r.Context(), sub); err == nil {
		writeJSON(w, http.StatusOK, memberView(m))
		return
	}

	user, err := s.Privy.User(r.Context(), sub)
	if err != nil {
		s.Log.Error("privy user lookup", "err", err)
		writeErr(w, http.StatusBadGateway, "could not read your Privy account")
		return
	}

	// The email comes from Privy for the verified DID, never from the browser —
	// otherwise anyone could sign in and claim the CFO's row.
	email := user.Email()
	if email == "" {
		writeErr(w, http.StatusBadRequest,
			"Your Privy account has no email, so we can't match you to the roster.")
		return
	}

	var wallet *string
	if a := user.EmbeddedWallet(); a != "" {
		wallet = &a
	}

	claimed, err := s.DB.ClaimMemberSeat(r.Context(), email, sub, wallet)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusForbidden,
			email+" isn't on any Quorly roster. Ask an owner to invite you.")
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, memberView(claimed))
}

/* ---------------------------------------------------------------- invoices */

func (s *Server) listInvoices(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	list, err := s.DB.Invoices(r.Context(), m.OrgID, 100)
	if err != nil {
		s.fail(w, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, i := range list {
		out = append(out, invoiceView(i))
	}
	writeJSON(w, http.StatusOK, map[string]any{"invoices": out})
}

func (s *Server) getInvoice(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}

	inv, err := s.DB.Invoice(r.Context(), r.PathValue("id"))
	if err != nil {
		s.fail(w, err)
		return
	}
	// Scope by org, not just by id: an invoice id is guessable enough that
	// cross-tenant reads would otherwise be one URL away.
	if inv.OrgID != m.OrgID {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	decision, err := s.Svc.Route(r.Context(), inv)
	if err != nil {
		s.fail(w, err)
		return
	}
	approvals, err := s.DB.Approvals(r.Context(), inv.ID)
	if err != nil {
		s.fail(w, err)
		return
	}
	trail, err := s.DB.AuditTrail(r.Context(), "invoice:"+inv.ID)
	if err != nil {
		s.fail(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"invoice":   invoiceView(inv),
		"routing":   routingView(decision),
		"approvals": approvals,
		"audit":     trail,
	})
}

func (s *Server) createInvoice(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}

	var body struct {
		Amount       float64 `json:"amount"`
		Currency     string  `json:"currency"`
		Number       *string `json:"number"`
		Description  *string `json:"description"`
		PayeeAddress *string `json:"payeeAddress"`
		PayeeENS     *string `json:"payeeEns"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if body.Amount <= 0 {
		writeErr(w, http.StatusBadRequest, "amount must be positive")
		return
	}

	inv, decision, err := s.Svc.CreateInvoice(r.Context(), service.NewInvoice{
		OrgID:        m.OrgID,
		SubmitterID:  m.ID,
		Amount:       body.Amount,
		Currency:     body.Currency,
		Number:       body.Number,
		Description:  body.Description,
		PayeeAddress: body.PayeeAddress,
		PayeeENS:     body.PayeeENS,
	})
	if err != nil {
		s.fail(w, err)
		return
	}
	// Chase the approvers, but don't fail the request if Slack is down — the
	// invoice is filed either way, and the dashboard still shows it.
	if s.Slack != nil {
		go func() {
			if err := s.Slack.FanOut(context.WithoutCancel(r.Context()), inv, decision); err != nil {
				s.Log.Warn("could not notify approvers", "err", err, "invoice", inv.ID)
			}
		}()
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"invoice": invoiceView(inv), "routing": routingView(decision),
	})
}

func (s *Server) decide(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}

	var body struct {
		Decision string  `json:"decision"`
		Note     *string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if body.Decision != "approve" && body.Decision != "reject" {
		writeErr(w, http.StatusBadRequest, `decision must be "approve" or "reject"`)
		return
	}

	out, err := s.Svc.Decide(r.Context(), r.PathValue("id"), m.ID, body.Decision, body.Note)
	if err != nil {
		s.fail(w, err)
		return
	}

	if !out.Gate.Allowed {
		resp := map[string]any{"ok": false, "code": out.Gate.Code, "error": out.Gate.Message}
		if out.NeedsSelfCheck {
			resp["verifyUrl"] = s.Cfg.AppURL + "/verify/" + r.PathValue("id")
		}
		writeJSON(w, http.StatusForbidden, resp)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"collected":     out.Collected,
		"required":      out.Required,
		"fullyApproved": out.FullyApproved,
		"status":        out.Invoice.Status,
	})
}

/* ------------------------------------------------------------------- world */

func (s *Server) worldContext(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}

	var body struct {
		InvoiceID string `json:"invoiceId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}

	inv, err := s.DB.Invoice(r.Context(), body.InvoiceID)
	if err != nil {
		s.fail(w, err)
		return
	}
	if inv.OrgID != m.OrgID {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if inv.Status != domain.StatusPendingApproval {
		writeErr(w, http.StatusConflict, "invoice is "+string(inv.Status))
		return
	}

	// Only mint a challenge for someone the policy actually lists as an
	// approver — otherwise anyone signed in could burn nonces.
	decision, err := s.Svc.Route(r.Context(), inv)
	if err != nil {
		s.fail(w, err)
		return
	}
	if !eligible(decision, m.ID) {
		writeErr(w, http.StatusForbidden, "not an approver on this invoice")
		return
	}

	if s.Signer == nil {
		writeErr(w, http.StatusServiceUnavailable, "world_not_configured")
		return
	}

	rpCtx, err := s.Signer.Sign(s.Cfg.World.Action, worldid.ChallengeTTL)
	if err != nil {
		s.fail(w, err)
		return
	}

	if err := s.DB.CreateChallenge(r.Context(), domain.Challenge{
		Nonce:     rpCtx.Nonce,
		OrgID:     inv.OrgID,
		InvoiceID: inv.ID,
		MemberID:  m.ID,
		Action:    s.Cfg.World.Action,
		Signal:    worldid.Signal(inv.ID, m.ID),
		ExpiresAt: time.Unix(int64(rpCtx.ExpiresAt), 0),
	}); err != nil {
		s.fail(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"rp_context":  rpCtx,
		"action":      s.Cfg.World.Action,
		"signal":      worldid.Signal(inv.ID, m.ID),
		"environment": s.Cfg.World.Environment,
	})
}

// attest does the whole checkpoint: burn the challenge, verify the proof, then
// record the approval it unblocks. One endpoint, so there is no window where a
// proof is accepted but the approval isn't.
func (s *Server) attest(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}

	var body struct {
		InvoiceID string         `json:"invoiceId"`
		Result    worldid.Result `json:"result"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}

	inv, err := s.DB.Invoice(r.Context(), body.InvoiceID)
	if err != nil {
		s.fail(w, err)
		return
	}
	if inv.OrgID != m.OrgID {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	if _, err := s.Svc.RecordAttestation(r.Context(), inv.ID, m.ID, inv.OrgID, body.Result); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	out, err := s.Svc.Decide(r.Context(), inv.ID, m.ID, "approve", nil)
	if err != nil {
		s.fail(w, err)
		return
	}
	if !out.Gate.Allowed {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": out.Gate.Message})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "collected": out.Collected,
		"required": out.Required, "fullyApproved": out.FullyApproved,
	})
}

func (s *Server) getOrg(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	org, err := s.DB.Org(r.Context(), m.OrgID)
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": org.ID, "name": org.Name, "ensName": org.ENSName,
		"treasuryAddress": org.TreasuryAddress, "treasuryQuorumId": org.TreasuryQuorumID,
		"settlementToken": s.Cfg.Chain.SettlementToken, "chainId": s.Cfg.Chain.ID,
	})
}

/* ------------------------------------------------------- policies & members */

func (s *Server) listPolicies(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	tiers, err := s.DB.Policies(r.Context(), m.OrgID)
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"policies": tiers})
}

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	m, err := auth.Require(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	roster, err := s.DB.Members(r.Context(), m.OrgID)
	if err != nil {
		s.fail(w, err)
		return
	}
	out := make([]map[string]any, 0, len(roster))
	for _, x := range roster {
		out = append(out, memberView(x))
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": out})
}

/* ------------------------------------------------------------------ views */

func memberView(m domain.Member) map[string]any {
	return map[string]any{
		"id": m.ID, "orgId": m.OrgID, "email": m.Email, "name": m.Name,
		"role": m.Role, "ensSubname": m.ENSSubname, "walletAddress": m.WalletAddress,
		"slackUserId": m.SlackUserID,
	}
}

func invoiceView(i domain.Invoice) map[string]any {
	return map[string]any{
		"id": i.ID, "number": i.Number, "description": i.Description,
		"amount": i.Amount, "currency": i.Currency, "status": i.Status,
		"payeeAddress": i.PayeeAddress, "payeeEns": i.PayeeENS,
		"requiredApprovals": i.RequiredApprovals, "privyIntentId": i.PrivyIntentID,
		"txHash": i.TxHash, "createdAt": i.CreatedAt, "paidAt": i.PaidAt,
	}
}

func routingView(d policy.Decision) map[string]any {
	approvers := make([]map[string]any, 0, len(d.EligibleApprovers))
	for _, m := range d.EligibleApprovers {
		approvers = append(approvers, map[string]any{"id": m.ID, "name": m.Display()})
	}
	return map[string]any{
		"policy": d.Policy.Name, "requiredApprovals": d.RequiredApprovals,
		"requiredAttestation": d.RequiredAttestation, "reason": d.Reason,
		"eligibleApprovers": approvers,
	}
}

func eligible(d policy.Decision, memberID string) bool {
	for _, m := range d.EligibleApprovers {
		if m.ID == memberID {
			return true
		}
	}
	return false
}
