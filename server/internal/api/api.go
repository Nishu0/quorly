// Package api exposes the HTTP surface. Handlers stay thin: decide who is
// acting, call a service, render JSON.
package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/Nishu0/quorly/server/internal/auth"
	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/privy"
	"github.com/Nishu0/quorly/server/internal/queue"
	"github.com/Nishu0/quorly/server/internal/service"
	"github.com/Nishu0/quorly/server/internal/slackapp"
	"github.com/Nishu0/quorly/server/internal/store"
	"github.com/Nishu0/quorly/server/internal/worldid"
)

type Server struct {
	Cfg      *config.Config
	DB       *store.Store
	Svc      *service.Service
	Privy    *privy.Client
	Queue    *queue.Queue
	Verifier *auth.Verifier
	Signer   *worldid.Signer
	Slack    *slackapp.App
	Log      *slog.Logger
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /api/me", s.me)
	mux.HandleFunc("POST /api/auth/sync", s.authSync)

	mux.HandleFunc("GET /api/invoices", s.listInvoices)
	mux.HandleFunc("GET /api/invoices/{id}", s.getInvoice)
	mux.HandleFunc("POST /api/invoices", s.createInvoice)
	mux.HandleFunc("POST /api/invoices/{id}/decide", s.decide)

	mux.HandleFunc("GET /api/policies", s.listPolicies)
	mux.HandleFunc("GET /api/members", s.listMembers)

	mux.HandleFunc("POST /api/world/context", s.worldContext)
	mux.HandleFunc("POST /api/attest", s.attest)

	mux.HandleFunc("GET /slack/install", s.slackInstall)
	mux.HandleFunc("GET /slack/oauth/callback", s.slackCallback)
	if s.Slack != nil {
		s.Slack.Routes(mux)
	}

	var h http.Handler = mux
	h = auth.Middleware(s.Verifier, s.DB)(h)
	h = s.cors(h)
	h = s.logging(h)
	return h
}

/* -------------------------------------------------------------- middleware */

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The browser sends the Privy token as a cookie, so the allowed origin
		// must be exact — "*" is incompatible with credentialed requests.
		w.Header().Set("Access-Control-Allow-Origin", s.Cfg.AppURL)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		w.Header().Set("Vary", "Origin")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		s.Log.Info("http",
			"method", r.Method, "path", r.URL.Path,
			"status", sw.status, "ms", time.Since(start).Milliseconds())
	})
}

/* ------------------------------------------------------------------ render */

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// fail maps domain errors onto status codes in one place, so handlers don't
// each invent their own.
func (s *Server) fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrNoSession):
		writeErr(w, http.StatusUnauthorized, "not signed in")
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "not found")
	default:
		s.Log.Error("request failed", "err", err)
		writeErr(w, http.StatusInternalServerError, "something went wrong")
	}
}
