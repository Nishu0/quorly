package store_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/store"
)

// Runs against the real database because the bug under test was a UNIQUE index
// firing on a multi-row UPDATE — a fake store would have happily "claimed" both
// seats and reported success.
func setup(t *testing.T) *store.Store {
	t.Helper()
	cfg, err := config.Load()
	if err != nil || cfg.DatabaseURL == "" {
		t.Skip("no DATABASE_URL; skipping integration test")
	}

	db, err := store.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		t.Skipf("database unreachable: %v", err)
	}
	t.Cleanup(db.Close)

	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return db
}

// seedSeat inserts one roster row and removes it again when the test ends, so
// these can run against a database that already has real orgs in it.
func seedSeat(t *testing.T, db *store.Store, orgID, email, role string) string {
	t.Helper()
	ctx := context.Background()
	stamp := time.Now().Format("150405.000000")
	id := "mem_test_" + role + "_" + stamp

	if _, err := db.Pool().Exec(ctx,
		`INSERT INTO orgs (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`, orgID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool().Exec(ctx,
		`INSERT INTO members (id, org_id, email, name, role) VALUES ($1, $2, $3, $4, $5)`,
		id, orgID, email, "Test "+role, role); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		db.Pool().Exec(context.Background(), `DELETE FROM members WHERE id=$1`, id)
		db.Pool().Exec(context.Background(), `DELETE FROM orgs WHERE id=$1`, orgID)
	})
	return id
}

// The regression: one address invited to two orgs used to make ClaimMemberSeat
// write the same DID to both rows, tripping members_privy_idx and returning a
// 500 from /api/auth/sync. The person could never sign in at all.
func TestClaimMemberSeatAcrossTwoOrgs(t *testing.T) {
	db := setup(t)
	ctx := context.Background()

	stamp := time.Now().Format("150405.000000")
	email := "two-orgs-" + stamp + "@quorly.test"
	did := "did:privy:test:" + stamp

	seedSeat(t, db, "org_test_a_"+stamp, email, "approver")
	ownerID := seedSeat(t, db, "org_test_b_"+stamp, email, "owner")

	claimed, err := db.ClaimMemberSeat(ctx, email, did, nil)
	if err != nil {
		t.Fatalf("claim failed for an address on two rosters: %v", err)
	}

	// Most privileged seat wins, so the owner row is the one that gets linked.
	if claimed.ID != ownerID {
		t.Errorf("claimed seat %s, want the owner seat %s", claimed.ID, ownerID)
	}

	// The other roster must be left untouched and still claimable by nobody —
	// writing the DID there too is precisely what the unique index forbids.
	var claimedCount int
	if err := db.Pool().QueryRow(ctx,
		`SELECT count(*) FROM members WHERE lower(email)=lower($1) AND privy_user_id=$2`,
		email, did).Scan(&claimedCount); err != nil {
		t.Fatal(err)
	}
	if claimedCount != 1 {
		t.Errorf("DID is on %d seats, want exactly 1", claimedCount)
	}
}

// Case-insensitive matching is what lets Privy's verified email meet a roster
// entry someone typed in a different case.
func TestClaimMemberSeatIsCaseInsensitive(t *testing.T) {
	db := setup(t)
	ctx := context.Background()

	stamp := time.Now().Format("150405.000000")
	email := "MixedCase-" + stamp + "@Quorly.Test"
	did := "did:privy:case:" + stamp

	want := seedSeat(t, db, "org_test_case_"+stamp, email, "member")

	claimed, err := db.ClaimMemberSeat(ctx, strings.ToLower(email), did, nil)
	if err != nil {
		t.Fatalf("claim failed: %v", err)
	}
	if claimed.ID != want {
		t.Errorf("claimed %s, want %s", claimed.ID, want)
	}
}

// A seat that somebody already holds must not be transferable, or signing in
// with a second Privy account would take over the first one's row.
func TestClaimMemberSeatWontStealAHeldSeat(t *testing.T) {
	db := setup(t)
	ctx := context.Background()

	stamp := time.Now().Format("150405.000000")
	email := "held-" + stamp + "@quorly.test"
	seedSeat(t, db, "org_test_held_"+stamp, email, "member")

	if _, err := db.ClaimMemberSeat(ctx, email, "did:privy:first:"+stamp, nil); err != nil {
		t.Fatalf("first claim failed: %v", err)
	}
	if _, err := db.ClaimMemberSeat(ctx, email, "did:privy:second:"+stamp, nil); err == nil {
		t.Error("a second Privy account took over a seat that was already held")
	}
}

// The bug behind /quorly team answering with the wrong roster: slack_user_id
// carries no unique index, so the same person on two rosters made an unscoped
// lookup return whichever row came first — here, an org with no workspace at
// all. Resolving through the team id is what disambiguates them.
func TestMemberBySlackTeamUserPicksTheActingWorkspace(t *testing.T) {
	db := setup(t)
	ctx := context.Background()

	stamp := time.Now().Format("150405.000000")
	slackUser := "U_TEST_" + stamp
	teamID := "T_TEST_" + stamp
	unlinkedOrg := "org_test_unlinked_" + stamp
	linkedOrg := "org_test_linked_" + stamp

	// An org with no Slack workspace, holding the same person's Slack ID —
	// exactly the shape the demo seed creates.
	strayID := seedSeat(t, db, unlinkedOrg, "stray-"+stamp+"@quorly.test", "approver")
	if _, err := db.Pool().Exec(ctx,
		`UPDATE members SET slack_user_id=$2 WHERE id=$1`, strayID, slackUser); err != nil {
		t.Fatal(err)
	}

	wantID := seedSeat(t, db, linkedOrg, "real-"+stamp+"@quorly.test", "owner")
	if _, err := db.Pool().Exec(ctx,
		`UPDATE members SET slack_user_id=$2 WHERE id=$1`, wantID, slackUser); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool().Exec(ctx,
		`UPDATE orgs SET slack_team_id=$2 WHERE id=$1`, linkedOrg, teamID); err != nil {
		t.Fatal(err)
	}

	got, err := db.MemberBySlackTeamUser(ctx, teamID, slackUser)
	if err != nil {
		t.Fatalf("lookup failed: %v", err)
	}
	if got.ID != wantID {
		t.Errorf("resolved to seat %s, want %s in the workspace that was acted in", got.ID, wantID)
	}
	if got.OrgID != linkedOrg {
		t.Errorf("resolved into org %s, want %s", got.OrgID, linkedOrg)
	}

	// A workspace nobody has installed must not fall back to some other org.
	if _, err := db.MemberBySlackTeamUser(ctx, "T_NOT_INSTALLED_"+stamp, slackUser); err == nil {
		t.Error("an unknown workspace resolved to a member anyway")
	}
}
