package slackapp

import "github.com/Nishu0/quorly/server/internal/money"

func fmtUSD(v float64) string { return money.USD(v) }
