package slackapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/slack-go/slack"
	"github.com/slack-go/slack/slackevents"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/service"
)

// Routes registers the three Slack entry points. HTTP rather than Socket Mode
// because OAuth makes this multi-workspace, and Socket Mode only ever serves
// the app's own workspace.
func (a *App) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /slack/events", a.handleEvents)
	mux.HandleFunc("POST /slack/interactions", a.handleInteractions)
	mux.HandleFunc("POST /slack/commands", a.handleCommand)
}

// readVerified reads the body and checks Slack's signature over it.
//
// Without this anyone who learns the URL can post events as Slack and approve
// their own invoices.
func (a *App) readVerified(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return nil, false
	}

	if a.SigningSecret == "" {
		a.Log.Warn("slack signature check skipped: no signing secret configured")
		return body, true
	}

	v, err := slack.NewSecretsVerifier(r.Header, a.SigningSecret)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	if _, err := v.Write(body); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	if err := v.Ensure(); err != nil {
		a.Log.Warn("slack signature rejected", "err", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	return body, true
}

/* ------------------------------------------------------------------ events */

func (a *App) handleEvents(w http.ResponseWriter, r *http.Request) {
	body, ok := a.readVerified(w, r)
	if !ok {
		return
	}

	ev, err := slackevents.ParseEvent(body, slackevents.OptionNoVerifyToken())
	if err != nil {
		http.Error(w, "bad event", http.StatusBadRequest)
		return
	}

	if ev.Type == slackevents.URLVerification {
		var c slackevents.ChallengeResponse
		if err := json.Unmarshal(body, &c); err != nil {
			http.Error(w, "bad challenge", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte(c.Challenge))
		return
	}

	// Slack retries anything it doesn't hear back from within three seconds, so
	// acknowledge first and do the work in the background.
	w.WriteHeader(http.StatusOK)

	if ev.Type != slackevents.CallbackEvent {
		return
	}
	// slack-go's MessageEvent omits `files`, so parse the envelope directly
	// rather than lose the attachment we actually came for.
	var envelope struct {
		TeamID string `json:"team_id"`
		Event  struct {
			Type        string `json:"type"`
			SubType     string `json:"subtype"`
			User        string `json:"user"`
			BotID       string `json:"bot_id"`
			Text        string `json:"text"`
			Channel     string `json:"channel"`
			ChannelType string `json:"channel_type"`
			Files       []struct {
				ID         string `json:"id"`
				Name       string `json:"name"`
				Mimetype   string `json:"mimetype"`
				URLPrivate string `json:"url_private"`
			} `json:"files"`
		} `json:"event"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		a.Log.Error("parse slack envelope", "err", err)
		return
	}
	if envelope.Event.Type != "message" {
		return
	}

	msg := incoming{
		TeamID:      envelope.TeamID,
		User:        envelope.Event.User,
		BotID:       envelope.Event.BotID,
		SubType:     envelope.Event.SubType,
		Text:        envelope.Event.Text,
		Channel:     envelope.Event.Channel,
		ChannelType: envelope.Event.ChannelType,
	}
	for _, f := range envelope.Event.Files {
		msg.Files = append(msg.Files, incomingFile{Mimetype: f.Mimetype, URLPrivate: f.URLPrivate})
	}

	go a.onMessage(context.WithoutCancel(r.Context()), msg)
}

type incomingFile struct {
	Mimetype   string
	URLPrivate string
}

type incoming struct {
	TeamID      string
	User        string
	BotID       string
	SubType     string
	Text        string
	Channel     string
	ChannelType string
	Files       []incomingFile
}

func (a *App) onMessage(ctx context.Context, ev incoming) {
	// Ignore our own posts, edits, and anything outside a DM.
	if ev.BotID != "" || ev.SubType != "" || ev.User == "" || ev.ChannelType != "im" {
		return
	}

	client, _, err := a.clientFor(ctx, ev.TeamID)
	if err != nil {
		a.Log.Error("no slack client", "err", err, "team", ev.TeamID)
		return
	}

	member, err := a.memberFor(ctx, ev.TeamID, ev.User)
	if err != nil {
		a.say(ctx, client, ev.Channel, fmt.Sprintf(
			"I don't have you on a roster yet. Ask an owner to invite you, or sign in at %s.", a.AppURL))
		return
	}

	if len(ev.Files) == 0 {
		a.say(ctx, client, ev.Channel,
			"Upload the invoice PDF or image here and I'll file it, route it, and chase the approver.")
		return
	}

	a.say(ctx, client, ev.Channel, ":mag: Reading your invoice…")

	file := ev.Files[0]
	data, err := a.download(ctx, client, file.URLPrivate)
	if err != nil {
		a.say(ctx, client, ev.Channel, ":warning: I couldn't download that file.")
		a.Log.Error("download slack file", "err", err)
		return
	}

	if !a.AI.Enabled() {
		a.say(ctx, client, ev.Channel,
			":warning: Invoice reading is off — ANTHROPIC_API_KEY isn't set.")
		return
	}

	extracted, err := a.AI.Extract(ctx, data, file.Mimetype, ev.Text)
	if err != nil {
		a.say(ctx, client, ev.Channel, ":warning: I couldn't read that file. "+err.Error())
		return
	}
	if extracted.Amount == nil || *extracted.Amount == "" {
		msg := ":warning: I couldn't find an amount on that document"
		if len(extracted.Missing) > 0 {
			msg += " (missing: " + strings.Join(extracted.Missing, ", ") + ")"
		}
		a.say(ctx, client, ev.Channel, msg+". Tell me the amount and I'll file it.")
		return
	}

	amount, err := parseAmount(*extracted.Amount)
	if err != nil {
		a.say(ctx, client, ev.Channel, ":warning: I read the amount as "+*extracted.Amount+", which I can't parse.")
		return
	}

	channel := ev.Channel
	inv, decision, err := a.Svc.CreateInvoice(ctx, service.NewInvoice{
		OrgID:          member.OrgID,
		SubmitterID:    member.ID,
		Amount:         amount,
		Number:         extracted.Number,
		Description:    firstNonEmpty(extracted.Description, &ev.Text),
		SlackChannelID: &channel,
	})
	if err != nil {
		a.say(ctx, client, ev.Channel, ":x: I couldn't file that: "+err.Error())
		return
	}

	a.say(ctx, client, ev.Channel, fmt.Sprintf(
		":receipt: Filed *%s %s*.\n%s\nI've pinged %s.",
		fmtUSD(inv.Amount), inv.Currency, decision.Reason, mentionList(decision)))
}

/* ------------------------------------------------------------ interactions */

func (a *App) handleInteractions(w http.ResponseWriter, r *http.Request) {
	body, ok := a.readVerified(w, r)
	if !ok {
		return
	}

	values, err := url.ParseQuery(string(body))
	if err != nil {
		http.Error(w, "bad payload", http.StatusBadRequest)
		return
	}

	var cb slack.InteractionCallback
	if err := json.Unmarshal([]byte(values.Get("payload")), &cb); err != nil {
		http.Error(w, "bad payload", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	go a.onInteraction(context.WithoutCancel(r.Context()), cb)
}

func (a *App) onInteraction(ctx context.Context, cb slack.InteractionCallback) {
	client, _, err := a.clientFor(ctx, cb.Team.ID)
	if err != nil {
		a.Log.Error("no slack client", "err", err)
		return
	}

	member, err := a.memberFor(ctx, cb.Team.ID, cb.User.ID)
	if err != nil {
		a.respond(cb.ResponseURL, "I don't know who you are in Quorly.")
		return
	}

	switch cb.Type {
	case slack.InteractionTypeBlockActions:
		if len(cb.ActionCallback.BlockActions) == 0 {
			return
		}
		action := cb.ActionCallback.BlockActions[0]

		switch action.ActionID {
		case "approve_invoice":
			a.approve(ctx, cb, member, action.Value)
		case "reject_invoice":
			if _, err := client.OpenViewContext(ctx, cb.TriggerID, RejectModal(action.Value)); err != nil {
				a.Log.Error("open reject modal", "err", err)
			}
		}

	case slack.InteractionTypeViewSubmission:
		invoiceID := cb.View.PrivateMetadata
		note := cb.View.State.Values["reason"]["value"].Value
		out, err := a.Svc.Decide(ctx, invoiceID, member.ID, "reject", &note)
		if err != nil {
			a.Log.Error("reject", "err", err)
			return
		}
		if !out.Gate.Allowed {
			return
		}
		if inv, err := a.DB.Invoice(ctx, invoiceID); err == nil {
			if submitter, err := a.DB.Member(ctx, inv.SubmitterID); err == nil && submitter.SlackUserID != nil {
				a.say(ctx, client, *submitter.SlackUserID,
					":x: Your invoice was rejected: "+note)
			}
		}
	}
}

func (a *App) approve(ctx context.Context, cb slack.InteractionCallback, member domain.Member, invoiceID string) {
	out, err := a.Svc.Decide(ctx, invoiceID, member.ID, "approve", nil)
	if err != nil {
		a.respond(cb.ResponseURL, ":x: "+err.Error())
		return
	}

	if !out.Gate.Allowed {
		if out.NeedsSelfCheck {
			// The button can't complete the approval — the tier needs a live
			// human — so hand over a link rather than failing silently.
			a.respondBlocks(cb.ResponseURL, VerifyPrompt(invoiceID, a.AppURL, out.Gate.Message))
			return
		}
		a.respond(cb.ResponseURL, ":no_entry: "+out.Gate.Message)
		return
	}

	if out.FullyApproved {
		a.respond(cb.ResponseURL, fmt.Sprintf(
			":white_check_mark: Approved — quorum met (%d/%d). The payout is queued.",
			out.Collected, out.Required))
		return
	}
	a.respond(cb.ResponseURL, fmt.Sprintf(
		":white_check_mark: Your approval is in (%d/%d). Waiting on the rest of the quorum.",
		out.Collected, out.Required))
}

/* ---------------------------------------------------------------- commands */

func (a *App) handleCommand(w http.ResponseWriter, r *http.Request) {
	body, ok := a.readVerified(w, r)
	if !ok {
		return
	}
	values, err := url.ParseQuery(string(body))
	if err != nil {
		http.Error(w, "bad command", http.StatusBadRequest)
		return
	}

	userID := values.Get("user_id")
	text := strings.TrimSpace(values.Get("text"))

	member, err := a.memberFor(r.Context(), values.Get("team_id"), userID)
	if err != nil {
		writeEphemeral(w, "You're not on a Quorly roster yet. Sign in at "+a.AppURL)
		return
	}

	sub, _, _ := strings.Cut(text, " ")
	switch sub {
	case "pending":
		list, err := a.DB.Invoices(r.Context(), member.OrgID, 50)
		if err != nil {
			writeEphemeral(w, "Couldn't read the ledger.")
			return
		}
		var lines []string
		for _, i := range list {
			if i.Status != "pending_approval" {
				continue
			}
			desc := i.ID
			if i.Description != nil {
				desc = *i.Description
			}
			lines = append(lines, fmt.Sprintf("• %s — %s", fmtUSD(i.Amount), desc))
		}
		if len(lines) == 0 {
			writeEphemeral(w, "Nothing pending. Clean desk.")
			return
		}
		writeEphemeral(w, strings.Join(lines, "\n"))

	case "team":
		roster, err := a.DB.Members(r.Context(), member.OrgID)
		if err != nil {
			writeEphemeral(w, "Couldn't read the roster.")
			return
		}
		var lines []string
		for _, m := range roster {
			line := fmt.Sprintf("• %s — _%s_", m.Display(), m.Role)
			if m.ENSSubname != nil {
				line += " (" + *m.ENSSubname + ")"
			}
			lines = append(lines, line)
		}
		writeEphemeral(w, strings.Join(lines, "\n"))

	case "wallet":
		if member.WalletAddress == nil || *member.WalletAddress == "" {
			writeEphemeral(w, "You don't have a wallet yet. Sign in at "+a.AppURL+
				" and one is created for you.")
			return
		}
		writeEphemeral(w, strings.Join([]string{
			"*Your wallet*",
			"`" + *member.WalletAddress + "`",
			"Balance and transfers: " + a.AppURL + "/dashboard/wallet",
		}, "\n"))

	case "treasury":
		org, err := a.DB.Org(r.Context(), member.OrgID)
		if err != nil {
			writeEphemeral(w, "Couldn't read the treasury.")
			return
		}
		if org.TreasuryAddress == nil || *org.TreasuryAddress == "" {
			writeEphemeral(w, "No treasury is attached to this workspace yet.")
			return
		}
		writeEphemeral(w, strings.Join([]string{
			"*" + org.Name + " treasury*",
			"`" + *org.TreasuryAddress + "`",
			"Payouts are released from here, and only by the key quorum that owns it.",
		}, "\n"))

	case "policy":
		tiers, err := a.DB.Policies(r.Context(), member.OrgID)
		if err != nil {
			writeEphemeral(w, "Couldn't read the rulebook.")
			return
		}
		var lines []string
		for _, t := range tiers {
			if !t.Active {
				continue
			}
			line := fmt.Sprintf("• *%s* — up to %s, %d approval", t.Name, fmtUSD(t.MaxAmount), t.RequiredApprovals)
			if t.RequiredApprovals != 1 {
				line += "s"
			}
			if t.RequiredAttestation != nil {
				line += ", live Selfie Check"
			}
			lines = append(lines, line)
		}
		if len(lines) == 0 {
			writeEphemeral(w, "No active tiers — nothing can be approved until one exists.")
			return
		}
		writeEphemeral(w, strings.Join(lines, "\n"))

	case "whoami":
		lines := []string{fmt.Sprintf("*%s* — _%s_", member.Display(), member.Role)}
		lines = append(lines, member.Email)
		if member.WalletAddress != nil && *member.WalletAddress != "" {
			lines = append(lines, "`"+*member.WalletAddress+"`")
		}
		writeEphemeral(w, strings.Join(lines, "\n"))

	default:
		writeEphemeral(w, helpText(a.AppURL))
	}
}

/* ----------------------------------------------------------------- helpers */

func (a *App) say(ctx context.Context, client *slack.Client, channel, text string) {
	if _, _, err := client.PostMessageContext(ctx, channel, slack.MsgOptionText(text, false)); err != nil {
		a.Log.Error("post message", "err", err)
	}
}

func (a *App) download(ctx context.Context, client *slack.Client, url string) ([]byte, error) {
	var buf bytes.Buffer
	if err := client.GetFileContext(ctx, url, &buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (a *App) respond(responseURL, text string) {
	a.post(responseURL, map[string]any{"replace_original": false, "response_type": "ephemeral", "text": text})
}

func (a *App) respondBlocks(responseURL string, blocks []slack.Block) {
	a.post(responseURL, map[string]any{
		"replace_original": false, "response_type": "ephemeral",
		"text": "Selfie Check required", "blocks": blocks,
	})
}

func (a *App) post(responseURL string, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		a.Log.Error("marshal slack response", "err", err)
		return
	}
	res, err := http.Post(responseURL, "application/json", bytes.NewReader(body))
	if err != nil {
		a.Log.Error("slack response_url", "err", err)
		return
	}
	_ = res.Body.Close()
}

func writeEphemeral(w http.ResponseWriter, text string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"response_type": "ephemeral", "text": text})
}

func mentionList(d policy.Decision) string {
	var names []string
	for _, m := range d.EligibleApprovers {
		if m.SlackUserID != nil {
			names = append(names, "<@"+*m.SlackUserID+">")
			continue
		}
		names = append(names, m.Display())
	}
	if len(names) == 0 {
		return "nobody yet — the roster has no linked approvers"
	}
	return strings.Join(names, ", ")
}

func firstNonEmpty(vals ...*string) *string {
	for _, v := range vals {
		if v != nil && strings.TrimSpace(*v) != "" {
			return v
		}
	}
	return nil
}

// parseAmount reads what the model extracted. It tolerates the shapes a model
// tends to emit — "$2,400.00", "2400 USD" — but never invents a number.
func parseAmount(raw string) (float64, error) {
	cleaned := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' {
			return r
		}
		return -1
	}, raw)
	if cleaned == "" {
		return 0, fmt.Errorf("no digits in %q", raw)
	}
	v, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return 0, err
	}
	if v <= 0 {
		return 0, fmt.Errorf("amount must be positive, got %v", v)
	}
	return v, nil
}
