// Package chat answers questions about an org's money in plain language.
//
// It runs on OpenRouter rather than the Anthropic client next door because the
// two jobs are different: extraction reads one document and must be exact,
// while this reads a whole org and must be fast enough that asking is cheaper
// than opening the dashboard.
package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultModel = "z-ai/glm-5.3-flash"

type Client struct {
	apiKey  string
	model   string
	appURL  string
	http    *http.Client
	enabled bool
}

func New(apiKey, model, appURL string) *Client {
	return &Client{
		apiKey:  strings.TrimSpace(apiKey),
		model:   orDefault(strings.TrimSpace(model), defaultModel),
		appURL:  appURL,
		http:    &http.Client{Timeout: 45 * time.Second},
		enabled: strings.TrimSpace(apiKey) != "",
	}
}

func (c *Client) Enabled() bool { return c != nil && c.enabled }

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Ask sends the conversation and returns the reply.
//
// The facts arrive as a system message built by the caller, never fetched by
// the model: it has no tools and no database, so anything it says about an
// invoice either came from that context or is invented. Keeping retrieval on
// our side is what makes the difference detectable.
func (c *Client) Ask(ctx context.Context, facts string, history []Message) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("chat is not configured")
	}

	msgs := append([]Message{{Role: "system", Content: systemPrompt(c.appURL) + "\n\n" + facts}}, history...)
	body, err := json.Marshal(map[string]any{
		"model":       c.model,
		"messages":    msgs,
		"temperature": 0.2,
		"max_tokens":  700,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	// OpenRouter attributes traffic by these; harmless, and it keeps the app
	// identifiable in their dashboard.
	req.Header.Set("HTTP-Referer", c.appURL)
	req.Header.Set("X-Title", "Quorly")

	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openrouter %d: %s", res.StatusCode, truncate(string(raw), 300))
	}

	var out struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("openrouter returned no reply")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func systemPrompt(appURL string) string {
	return strings.Join([]string{
		"You are Quorly, an approvals assistant living in Slack. Quorly files contractor",
		"invoices, routes them against a spend policy, requires a live World ID Selfie Check",
		"above a threshold, and pays out from a treasury owned by an m-of-n key quorum.",
		"",
		"Answer from the CONTEXT below and nothing else. It holds everything you know about",
		"this person and their organisation. If the answer isn't there, say so and suggest",
		"where to look — never guess an amount, a status, an address or an invoice id.",
		"Inventing one is worse than admitting you don't know, because someone will act on it.",
		"",
		"Every invoice in the context comes with a link. Use those links verbatim. Never",
		"construct one yourself, and never offer a link for an invoice that isn't listed.",
		"",
		"When someone can act on an invoice, say so and give them the link. When they can't,",
		"say why in one line — they aren't an approver on that tier, or they filed it and",
		"self-approval is blocked.",
		"",
		"Be brief. Slack, not email: a couple of sentences, or a short list when there are",
		"several things. Amounts as $1,234.00. No preamble, no sign-off, no markdown headings.",
		"The dashboard is " + appURL + ".",
	}, "\n")
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
