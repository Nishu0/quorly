package slackapp

import (
	"context"
	"regexp"
	"strings"

	"github.com/Nishu0/quorly/server/internal/chat"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/slack-go/slack"
)

// mentionPattern matches the <@U123> Slack puts in the text of a mention.
var mentionPattern = regexp.MustCompile(`<@[A-Z0-9]+>`)

// answer replies to a question in plain language.
//
// Everything the model can say is assembled by the Assistant first, so a reply
// is grounded in this person's actual invoices or it admits it doesn't know.
// Nothing here can approve anything: the worst a wrong answer costs is a wrong
// sentence, and the link it hands over still lands on a page that checks who
// you are and asks for your face.
func (a *App) answer(ctx context.Context, client *slack.Client, ev incoming, m domain.Member, mention bool) {
	question := strings.TrimSpace(mentionPattern.ReplaceAllString(ev.Text, ""))

	if a.Assistant == nil || !a.Assistant.Enabled() {
		a.say(ctx, client, ev.Channel,
			"Upload an invoice PDF here and I'll file it. Ask me anything with `/quorly help`.")
		return
	}
	if question == "" {
		a.say(ctx, client, ev.Channel,
			"Ask me about an invoice, what's waiting on you, or where a payment got to.")
		return
	}

	// Reply in the thread when mentioned, so a busy channel doesn't turn into
	// a pile of loose answers.
	threadTS := ev.ThreadTS
	if mention && threadTS == "" {
		threadTS = ev.TS
	}

	reply, err := a.Assistant.Answer(ctx, m, question, a.history(ctx, client, ev, threadTS))
	if err != nil {
		a.Log.Error("assistant", "err", err, "member", m.ID)
		a.say(ctx, client, ev.Channel, "I couldn't work that out just now. Try again in a moment.")
		return
	}

	opts := []slack.MsgOption{slack.MsgOptionText(reply, false)}
	if threadTS != "" {
		opts = append(opts, slack.MsgOptionTS(threadTS))
	}
	if _, _, err := client.PostMessageContext(ctx, ev.Channel, opts...); err != nil {
		a.Log.Error("post answer", "err", err)
	}
}

// history reads the thread so a follow-up question makes sense on its own.
//
// Best-effort: an unreadable thread costs context, not the answer, so it
// returns empty rather than failing the reply.
func (a *App) history(ctx context.Context, client *slack.Client, ev incoming, threadTS string) []chat.Message {
	if threadTS == "" {
		return nil
	}
	replies, _, _, err := client.GetConversationRepliesContext(ctx, &slack.GetConversationRepliesParameters{
		ChannelID: ev.Channel,
		Timestamp: threadTS,
		Limit:     12,
	})
	if err != nil {
		return nil
	}

	out := make([]chat.Message, 0, len(replies))
	for _, r := range replies {
		text := strings.TrimSpace(mentionPattern.ReplaceAllString(r.Text, ""))
		if text == "" || r.Timestamp == ev.TS {
			continue // skip the question we are about to ask
		}
		role := "user"
		if r.BotID != "" || r.SubType == "bot_message" {
			role = "assistant"
		}
		out = append(out, chat.Message{Role: role, Content: text})
	}
	return out
}
