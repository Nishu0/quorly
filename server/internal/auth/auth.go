// Package auth turns a Privy access token into a Quorly member.
//
// Identity is decided here and nowhere else. An earlier version of the approval
// page read the approver out of a query parameter, which meant anyone holding
// the link could approve as anyone.
package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/store"
)

var (
	ErrNoSession = errors.New("not signed in")
	ErrNoSeat    = errors.New("signed in, but not on any roster")
)

type Verifier struct {
	appID string
	cache *jwk.Cache
	jwks  string
}

// NewVerifier fetches Privy's public keys on demand and refreshes them in the
// background, so a key rotation doesn't take the service down.
func NewVerifier(ctx context.Context, appID string) (*Verifier, error) {
	url := "https://auth.privy.io/api/v1/apps/" + appID + "/jwks.json"

	cache, err := jwk.NewCache(ctx, nil)
	if err != nil {
		return nil, err
	}
	if err := cache.Register(ctx, url, jwk.WithMinInterval(15*time.Minute)); err != nil {
		return nil, err
	}
	return &Verifier{appID: appID, cache: cache, jwks: url}, nil
}

// UserID verifies the token and returns the Privy DID.
func (v *Verifier) UserID(ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", ErrNoSession
	}

	set, err := v.cache.Lookup(ctx, v.jwks)
	if err != nil {
		return "", err
	}

	parsed, err := jwt.Parse([]byte(token),
		jwt.WithKeySet(set),
		jwt.WithIssuer("privy.io"),
		jwt.WithAudience(v.appID),
		jwt.WithValidate(true),
	)
	if err != nil {
		return "", ErrNoSession
	}

	sub, ok := parsed.Subject()
	if !ok || sub == "" {
		return "", ErrNoSession
	}
	return sub, nil
}

// TokenFrom pulls the access token out of a request. Privy puts it in a cookie
// when using cookie mode and in the Authorization header otherwise.
func TokenFrom(r *http.Request) string {
	if c, err := r.Cookie("privy-token"); err == nil && c.Value != "" {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

type ctxKey struct{}

// Middleware attaches the signed-in member to the request context when there is
// one. It never rejects: handlers decide what requires a session, so public
// pages stay public.
func Middleware(v *Verifier, db *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sub, err := v.UserID(r.Context(), TokenFrom(r))
			if err == nil {
				if m, err := db.MemberByPrivyID(r.Context(), sub); err == nil {
					r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, &m))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Member returns the signed-in member, or nil.
func Member(ctx context.Context) *domain.Member {
	m, _ := ctx.Value(ctxKey{}).(*domain.Member)
	return m
}

// Require is the guard for anything that acts on the org's behalf.
func Require(ctx context.Context) (domain.Member, error) {
	m := Member(ctx)
	if m == nil {
		return domain.Member{}, ErrNoSession
	}
	return *m, nil
}
