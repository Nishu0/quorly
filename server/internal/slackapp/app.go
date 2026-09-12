package slackapp

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/slack-go/slack"

	"github.com/Nishu0/quorly/server/internal/ai"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/service"
	"github.com/Nishu0/quorly/server/internal/store"
)

type App struct {
	DB            *store.Store
	Svc           *service.Service
	AI            *ai.Client
	Log           *slog.Logger
	AppURL        string
	Explorer      string
	SigningSecret string
	// DevBotToken is used when a workspace has no stored installation, so a
	// single-workspace dev setup works before OAuth is configured.
	DevBotToken string
}

// clientFor returns a Slack client bound to the workspace that sent the event.
// Multi-tenancy lives here: each workspace's own bot token, never a global one.
func (a *App) clientFor(ctx context.Context, teamID string) (*slack.Client, domain.SlackInstallation, error) {
	in, err := a.DB.Installation(ctx, teamID)
	if err == nil {
		return slack.New(in.BotToken), in, nil
	}
	if a.DevBotToken != "" {
		return slack.New(a.DevBotToken), domain.SlackInstallation{TeamID: teamID}, nil
	}
	return nil, domain.SlackInstallation{}, fmt.Errorf("workspace %s has not installed Quorly", teamID)
}

// memberFor resolves the Slack user to a Quorly member, within the workspace
// the request came from — never by Slack ID alone.
func (a *App) memberFor(ctx context.Context, slackTeamID, slackUserID string) (domain.Member, error) {
	return a.DB.MemberBySlackTeamUser(ctx, slackTeamID, slackUserID)
}

// FanOut posts the approval card to every eligible approver's DM.
func (a *App) FanOut(ctx context.Context, inv domain.Invoice, d policy.Decision) error {
	org, err := a.DB.Org(ctx, inv.OrgID)
	if err != nil {
		return err
	}
	if org.SlackTeamID == nil {
		return nil // org isn't linked to a workspace; nothing to post to
	}

	client, _, err := a.clientFor(ctx, *org.SlackTeamID)
	if err != nil {
		return err
	}

	submitter, err := a.DB.Member(ctx, inv.SubmitterID)
	if err != nil {
		return err
	}

	blocks := InvoiceCard(inv, submitter, d, 0, a.AppURL)
	for _, approver := range d.EligibleApprovers {
		if approver.SlackUserID == nil {
			continue
		}
		if _, _, err := client.PostMessageContext(ctx, *approver.SlackUserID,
			slack.MsgOptionBlocks(blocks...),
			slack.MsgOptionText(fmt.Sprintf("Approval needed: %s to %s",
				usd(inv.Amount), submitter.Display()), false),
		); err != nil {
			a.Log.Error("post approval card", "err", err, "approver", approver.ID)
		}
	}
	return nil
}

// NotifyPaid tells the submitter's channel that the money landed.
func (a *App) NotifyPaid(ctx context.Context, inv domain.Invoice) error {
	if inv.SlackChannelID == nil {
		return nil
	}
	org, err := a.DB.Org(ctx, inv.OrgID)
	if err != nil || org.SlackTeamID == nil {
		return err
	}
	client, _, err := a.clientFor(ctx, *org.SlackTeamID)
	if err != nil {
		return err
	}
	_, _, err = client.PostMessageContext(ctx, *inv.SlackChannelID,
		slack.MsgOptionBlocks(PaidCard(inv, a.Explorer)...),
		slack.MsgOptionText("Paid "+usd(inv.Amount), false))
	return err
}

func usd(v float64) string {
	// Small local helper so blocks.go's money import stays the single source.
	return strings.TrimSpace(fmtUSD(v))
}
