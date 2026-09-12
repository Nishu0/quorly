// Package ai turns an uploaded invoice into structured fields.
package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

type Invoice struct {
	Amount      *string  `json:"amount"`
	Currency    *string  `json:"currency"`
	Number      *string  `json:"number"`
	Description *string  `json:"description"`
	DueDate     *string  `json:"dueDate"`
	Vendor      *string  `json:"vendor"`
	Confidence  float64  `json:"confidence"`
	Missing     []string `json:"missing"`
}

type Client struct {
	client  anthropic.Client
	model   anthropic.Model
	enabled bool
}

func New(apiKey, model string) *Client {
	if apiKey == "" {
		return &Client{enabled: false}
	}
	if model == "" {
		model = "claude-opus-5"
	}
	return &Client{
		client:  anthropic.NewClient(option.WithAPIKey(apiKey)),
		model:   anthropic.Model(model),
		enabled: true,
	}
}

func (c *Client) Enabled() bool { return c.enabled }

var extractSchema = anthropic.ToolInputSchemaParam{
	Properties: map[string]any{
		"amount":      map[string]any{"type": []string{"string", "null"}, "description": "Total due, digits only, e.g. 2400.00"},
		"currency":    map[string]any{"type": []string{"string", "null"}, "description": "ISO code or QUSD"},
		"number":      map[string]any{"type": []string{"string", "null"}, "description": "Invoice number"},
		"description": map[string]any{"type": []string{"string", "null"}, "description": "One line describing the work billed"},
		"dueDate":     map[string]any{"type": []string{"string", "null"}, "description": "ISO 8601 date"},
		"vendor":      map[string]any{"type": []string{"string", "null"}, "description": "Who is billing"},
		"confidence":  map[string]any{"type": "number", "description": "0-1 confidence in the extraction"},
		"missing":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Required fields you could not find"},
	},
	Required: []string{"amount", "confidence", "missing"},
}

// Extract reads a PDF or image. It is told to prefer null over a guess:
// money moves off these fields, so a missing amount must stop the flow rather
// than become a plausible-looking hallucination.
func (c *Client) Extract(ctx context.Context, data []byte, mediaType, userText string) (Invoice, error) {
	if !c.enabled {
		return Invoice{}, fmt.Errorf("ANTHROPIC_API_KEY is not set")
	}

	var source anthropic.ContentBlockParamUnion
	switch mediaType {
	case "application/pdf":
		source = anthropic.NewDocumentBlock(anthropic.Base64PDFSourceParam{
			Data: base64.StdEncoding.EncodeToString(data),
		})
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		source = anthropic.NewImageBlockBase64(mediaType, base64.StdEncoding.EncodeToString(data))
	default:
		return Invoice{}, fmt.Errorf("unsupported file type %q", mediaType)
	}

	prompt := "Extract the invoice fields. Do not guess an amount you cannot see — " +
		"list it under `missing` instead. Money moves off this extraction, so prefer " +
		"null over a plausible-looking hallucination."
	if userText != "" {
		prompt += "\n\nThe submitter also said: " + userText
	}

	res, err := c.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     c.model,
		MaxTokens: 4096,
		Tools: []anthropic.ToolUnionParam{{
			OfTool: &anthropic.ToolParam{
				Name:        "record_invoice",
				Description: anthropic.String("Record the structured fields extracted from an invoice document."),
				InputSchema: extractSchema,
			},
		}},
		ToolChoice: anthropic.ToolChoiceUnionParam{
			OfTool: &anthropic.ToolChoiceToolParam{Name: "record_invoice", Type: constant.ValueOf[constant.Tool]()},
		},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(source, anthropic.NewTextBlock(prompt)),
		},
	})
	if err != nil {
		return Invoice{}, err
	}

	for _, block := range res.Content {
		if block.Type != "tool_use" {
			continue
		}
		var out Invoice
		if err := json.Unmarshal([]byte(block.Input), &out); err != nil {
			return Invoice{}, fmt.Errorf("model returned unparseable extraction: %w", err)
		}
		return out, nil
	}
	return Invoice{}, fmt.Errorf("model returned no extraction")
}
