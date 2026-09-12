// Package slackapp is the Slack surface: approval cards, event handling, and
// the slash command. It talks to the same services the HTTP API does, so an
// approval means the same thing wherever it happens.
package slackapp

import (
	"fmt"
	"strings"

	"github.com/slack-go/slack"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/money"
	"github.com/Nishu0/quorly/server/internal/policy"
)

func InvoiceCard(inv domain.Invoice, submitter domain.Member, d policy.Decision, collected int, appURL string) []slack.Block {
	number := inv.ID
	if inv.Number != nil && *inv.Number != "" {
		number = *inv.Number
	}

	blocks := []slack.Block{
		slack.NewHeaderBlock(slack.NewTextBlockObject(slack.PlainTextType,
			"Invoice "+number, false, false)),
		slack.NewSectionBlock(nil, []*slack.TextBlockObject{
			slack.NewTextBlockObject(slack.MarkdownType,
				fmt.Sprintf("*Amount*\n%s %s", money.USD(inv.Amount), inv.Currency), false, false),
			slack.NewTextBlockObject(slack.MarkdownType,
				"*From*\n"+submitter.Display(), false, false),
			slack.NewTextBlockObject(slack.MarkdownType,
				"*Policy*\n"+d.Policy.Name, false, false),
			slack.NewTextBlockObject(slack.MarkdownType,
				fmt.Sprintf("*Approvals*\n%d of %d", collected, d.RequiredApprovals), false, false),
		}, nil),
	}

	if inv.Description != nil && *inv.Description != "" {
		blocks = append(blocks, slack.NewSectionBlock(
			slack.NewTextBlockObject(slack.MarkdownType, "_"+*inv.Description+"_", false, false), nil, nil))
	}

	blocks = append(blocks, slack.NewContextBlock("routing",
		slack.NewTextBlockObject(slack.MarkdownType, ":scales: "+d.Reason, false, false)))

	if d.RequiredAttestation != nil {
		blocks = append(blocks, slack.NewContextBlock("attestation",
			slack.NewTextBlockObject(slack.MarkdownType,
				":selfie: This tier requires a live *Selfie Check* at the moment of approval.", false, false)))
	}

	if inv.Status == domain.StatusPendingApproval {
		approve := slack.NewButtonBlockElement("approve_invoice", inv.ID,
			slack.NewTextBlockObject(slack.PlainTextType, "Approve", false, false))
		approve.Style = slack.StylePrimary

		reject := slack.NewButtonBlockElement("reject_invoice", inv.ID,
			slack.NewTextBlockObject(slack.PlainTextType, "Reject", false, false))
		reject.Style = slack.StyleDanger

		open := slack.NewButtonBlockElement("open_invoice", inv.ID,
			slack.NewTextBlockObject(slack.PlainTextType, "Open in Quorly", false, false))
		open.URL = appURL + "/invoices/" + inv.ID

		blocks = append(blocks, slack.NewActionBlock("inv_actions:"+inv.ID, approve, reject, open))
	}

	return blocks
}

// VerifyPrompt is what an approver sees when the tier demands a live check.
func VerifyPrompt(invoiceID, appURL, reason string) []slack.Block {
	verify := slack.NewButtonBlockElement("goto_verify", invoiceID,
		slack.NewTextBlockObject(slack.PlainTextType, "Verify with World ID", false, false))
	verify.Style = slack.StylePrimary
	verify.URL = appURL + "/verify/" + invoiceID

	return []slack.Block{
		slack.NewSectionBlock(slack.NewTextBlockObject(slack.MarkdownType,
			":lock: *"+reason+"*\nThis payout tier needs proof that a live human is behind the click — "+
				"not a stolen Slack session or a bot.", false, false), nil, nil),
		slack.NewActionBlock("verify:"+invoiceID, verify),
		slack.NewContextBlock("verify_note", slack.NewTextBlockObject(slack.MarkdownType,
			"Selfie Check takes about ten seconds. Your proof is bound to this one invoice and can't be reused.",
			false, false)),
	}
}

func PaidCard(inv domain.Invoice, explorer string) []slack.Block {
	payee := ""
	if inv.PayeeENS != nil {
		payee = *inv.PayeeENS
	} else if inv.PayeeAddress != nil {
		payee = *inv.PayeeAddress
	}

	blocks := []slack.Block{
		slack.NewSectionBlock(slack.NewTextBlockObject(slack.MarkdownType,
			fmt.Sprintf(":white_check_mark: *Paid* — %s %s sent to `%s`",
				money.USD(inv.Amount), inv.Currency, payee), false, false), nil, nil),
	}
	if inv.TxHash != nil && *inv.TxHash != "" {
		blocks = append(blocks, slack.NewContextBlock("tx",
			slack.NewTextBlockObject(slack.MarkdownType,
				fmt.Sprintf("<%s/tx/%s|View transaction>", explorer, *inv.TxHash), false, false)))
	}
	return blocks
}

func RejectModal(invoiceID string) slack.ModalViewRequest {
	return slack.ModalViewRequest{
		Type:            slack.VTModal,
		CallbackID:      "reject_modal",
		PrivateMetadata: invoiceID,
		Title:           slack.NewTextBlockObject(slack.PlainTextType, "Reject invoice", false, false),
		Submit:          slack.NewTextBlockObject(slack.PlainTextType, "Reject", false, false),
		Blocks: slack.Blocks{BlockSet: []slack.Block{
			slack.NewInputBlock("reason",
				slack.NewTextBlockObject(slack.PlainTextType, "Why are you rejecting this?", false, false),
				nil,
				&slack.PlainTextInputBlockElement{
					Type:      slack.METPlainTextInput,
					ActionID:  "value",
					Multiline: true,
					Placeholder: slack.NewTextBlockObject(slack.PlainTextType,
						"Missing PO number, wrong rate, duplicate…", false, false),
				}),
		}},
	}
}

func helpText(appURL string) string {
	return strings.Join([]string{
		"*Quorly*",
		"• DM me an invoice PDF to file it",
		"• `/quorly pending` — open invoices",
		"• `/quorly team` — the roster and who can approve",
		"• Dashboard: " + appURL,
	}, "\n")
}
