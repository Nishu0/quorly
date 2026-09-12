package worldid

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSignalBindsToInvoiceAndApprover(t *testing.T) {
	if got := Signal("inv_1", "mel"); got != "inv_1:mel" {
		t.Errorf("got %q", got)
	}
	// A proof captured for one payout must be meaningless against any other.
	if Signal("inv_1", "mel") == Signal("inv_2", "mel") {
		t.Error("signal does not distinguish invoices")
	}
	if Signal("inv_1", "mel") == Signal("inv_1", "dana") {
		t.Error("signal does not distinguish approvers")
	}
}

func TestDemoModeSkipsTheNetwork(t *testing.T) {
	c := New("http://127.0.0.1:1", "", "staging", false) // empty rp id => demo
	got, err := c.Verify(context.Background(), Result{Nonce: "n_1"}, "approve-payout")
	if err != nil {
		t.Fatalf("demo mode reached the network: %v", err)
	}
	if !got.OK || got.Nullifier != "demo_n_1" {
		t.Errorf("got %+v", got)
	}
}

func TestVerifyTrustsTheVerifiersNullifier(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/api/v4/verify/rp_test") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		// Forwarded verbatim, including the action we supply server-side.
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["action"] != "approve-payout" {
			t.Errorf("action not forwarded: %v", body["action"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true, "nullifier": "0xserver", "environment": "staging",
		})
	}))
	defer srv.Close()

	c := New(srv.URL, "rp_test", "staging", false)
	got, err := c.Verify(context.Background(), Result{Nonce: "n_1", ProtocolVersion: "3.0"}, "approve-payout")
	if err != nil {
		t.Fatal(err)
	}
	if !got.OK || got.Nullifier != "0xserver" {
		t.Errorf("got %+v, want the server's nullifier", got)
	}
}

func TestVerifyReportsFailureWithoutError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false, "code": "all_verifications_failed", "detail": "nope",
		})
	}))
	defer srv.Close()

	c := New(srv.URL, "rp_test", "staging", false)
	got, err := c.Verify(context.Background(), Result{Nonce: "n_1"}, "a")
	if err != nil {
		t.Fatalf("a rejected proof is not a transport error: %v", err)
	}
	if got.OK {
		t.Error("a 400 was treated as success")
	}
	if got.Code != "all_verifications_failed" {
		t.Errorf("got code %q", got.Code)
	}
}

func TestVerifyRejectsSuccessFalseOn200(t *testing.T) {
	// A 200 with success:false must not be read as a pass.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "code": "verification_error"})
	}))
	defer srv.Close()

	c := New(srv.URL, "rp_test", "staging", false)
	got, _ := c.Verify(context.Background(), Result{Nonce: "n"}, "a")
	if got.OK {
		t.Error("success:false on HTTP 200 was accepted")
	}
}

func TestExplain(t *testing.T) {
	if !strings.Contains(Explain("all_verifications_failed", ""), "lighting") {
		t.Error("missing actionable copy")
	}
	if !strings.Contains(Explain("user_presence_failed", ""), "Liveness") {
		t.Error("missing liveness copy")
	}
	if got := Explain("weird", "Something specific"); got != "Something specific" {
		t.Errorf("got %q, want the verifier's own detail", got)
	}
}
