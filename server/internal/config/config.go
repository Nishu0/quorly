// Package config loads settings from the environment, walking up to the repo
// root so a binary started from any directory finds the same .env.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL string
	Addr        string
	AppURL      string

	Privy PrivyConfig
	World WorldConfig
	Slack SlackConfig
	Chain ChainConfig
}

type PrivyConfig struct {
	AppID     string
	AppSecret string
	// AuthKeys holds every authorization key. A wallet owned by an m-of-n
	// quorum needs m signatures, so this is a list, not a single key.
	AuthKeys []string
	QuorumID string
	BaseURL  string
}

type WorldConfig struct {
	AppID       string
	Action      string
	RPID        string
	SigningKey  string
	BaseURL     string
	Environment string
}

type SlackConfig struct {
	ClientID      string
	ClientSecret  string
	SigningSecret string
	BotToken      string // single-workspace dev fallback
	AppToken      string
}

type ChainConfig struct {
	ID              int
	RPCURL          string
	SettlementToken string
	// PrivyChain is how Privy names this chain in a transfer intent, which is
	// its own vocabulary rather than the CAIP-2 id used elsewhere. Configurable
	// because the accepted spelling is provider-specific.
	PrivyChain string
}

// Load reads .env from the nearest ancestor directory that has one, then
// overlays the real environment. Values already set in the environment win.
func Load() (*Config, error) {
	if path, ok := findEnv(); ok {
		_ = godotenv.Load(path)
	}

	c := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		Addr:        envOr("ADDR", ":8080"),
		AppURL:      envOr("APP_URL", "http://localhost:3000"),
		Privy: PrivyConfig{
			AppID:     os.Getenv("PRIVY_APP_ID"),
			AppSecret: os.Getenv("PRIVY_APP_SECRET"),
			AuthKeys:  splitKeys(os.Getenv("PRIVY_AUTHORIZATION_PRIVATE_KEY")),
			QuorumID:  os.Getenv("PRIVY_TREASURY_QUORUM_ID"),
			BaseURL:   envOr("PRIVY_API_BASE", "https://api.privy.io"),
		},
		World: WorldConfig{
			AppID:       os.Getenv("NEXT_PUBLIC_WORLD_APP_ID"),
			Action:      envOr("NEXT_PUBLIC_WORLD_ACTION", "approve-payout"),
			RPID:        os.Getenv("WORLD_RP_ID"),
			SigningKey:  os.Getenv("WORLD_RP_SIGNING_KEY"),
			BaseURL:     envOr("WORLD_API_BASE", "https://developer.world.org"),
			Environment: envOr("WORLD_ENVIRONMENT", "staging"),
		},
		Slack: SlackConfig{
			ClientID:      os.Getenv("SLACK_CLIENT_ID"),
			ClientSecret:  os.Getenv("SLACK_CLIENT_SECRET"),
			SigningSecret: os.Getenv("SLACK_SIGNING_SECRET"),
			BotToken:      os.Getenv("SLACK_BOT_TOKEN"),
			AppToken:      os.Getenv("SLACK_APP_TOKEN"),
		},
		Chain: ChainConfig{
			ID:              intOr("CHAIN_ID", 84532),
			RPCURL:          envOr("RPC_URL", "https://sepolia.base.org"),
			SettlementToken: os.Getenv("USDC_ADDRESS"),
			PrivyChain:      envOr("PRIVY_CHAIN", "base-sepolia"),
		},
	}

	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	return c, nil
}

// Demo reports whether to stub third-party calls. Without Privy credentials
// there is nothing to call, and the flow should still be demonstrable.
func (c *Config) Demo() bool {
	return os.Getenv("DEMO_MODE") == "1" || c.Privy.AppID == ""
}

func findEnv() (string, bool) {
	dir, err := os.Getwd()
	if err != nil {
		return "", false
	}
	for {
		candidate := filepath.Join(dir, ".env")
		if _, err := os.Stat(candidate); err == nil {
			return candidate, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func intOr(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return v
	}
	return fallback
}

func splitKeys(raw string) []string {
	var out []string
	for _, k := range strings.Split(raw, ",") {
		if k = strings.TrimSpace(k); k != "" {
			out = append(out, k)
		}
	}
	return out
}
