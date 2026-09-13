package chat

import "testing"

func TestDisabledWithoutKey(t *testing.T) {
	if New("", "", "https://quorly.xyz").Enabled() {
		t.Error("chat reported enabled with no API key")
	}
	if !New("sk-test", "", "https://quorly.xyz").Enabled() {
		t.Error("chat reported disabled with a key")
	}
}

func TestDefaultsToConfiguredModel(t *testing.T) {
	if got := New("k", "", "u").model; got != defaultModel {
		t.Errorf("model = %q, want %q", got, defaultModel)
	}
	if got := New("k", "anthropic/claude-3", "u").model; got != "anthropic/claude-3" {
		t.Errorf("model = %q, want the override", got)
	}
}

// The prompt is the only thing standing between a helpful answer and an
// invented invoice id, so the instructions that matter are pinned.
func TestSystemPromptForbidsInvention(t *testing.T) {
	p := systemPrompt("https://quorly.xyz")
	for _, want := range []string{"never guess", "Use those links verbatim", "https://quorly.xyz"} {
		if !contains(p, want) {
			t.Errorf("system prompt is missing %q", want)
		}
	}
}

func contains(hay, needle string) bool {
	return len(hay) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(hay); i++ {
			if hay[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}
