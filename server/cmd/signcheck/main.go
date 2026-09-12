package main

import (
	"fmt"
	"os"

	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/worldid"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Println("config:", err)
		os.Exit(1)
	}
	s, err := worldid.NewSigner(cfg.World.SigningKey, cfg.World.RPID)
	if err != nil {
		fmt.Println("signer:", err)
		os.Exit(1)
	}
	ctx, err := s.Sign(cfg.World.Action, worldid.ChallengeTTL)
	if err != nil {
		fmt.Println("sign:", err)
		os.Exit(1)
	}
	fmt.Printf("rp_id=%s\nnonce=%s…\nttl=%ds\nsig len=%d\n",
		ctx.RPID, ctx.Nonce[:20], ctx.ExpiresAt-ctx.CreatedAt, len(ctx.Signature))
}
