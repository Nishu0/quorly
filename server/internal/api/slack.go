package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/ids"
	"github.com/Nishu0/quorly/server/internal/policy"
)

// botScopes are the minimum the bot needs: read DMs and files, post, and run
// the slash command. Anything broader is a permission the workspace owner would
// be right to question.
const botScopes = "chat:write,commands,files:read,im:history,im:write,users:read,users:read.email,team:read"

// slackInstall starts the OAuth dance. This is the install flow (bot token),
// not Sign in with Slack — it grants the app the workspace, which is what
// creates the org.
func (s *Server) slackInstall(w http.ResponseWriter, r *http.Request) {
	if s.Cfg.Slack.ClientID == "" {
		writeErr(w, http.StatusServiceUnavailable, "slack is not configured")
		return
	}

	q := url.Values{}
	q.Set("client_id", s.Cfg.Slack.ClientID)
	q.Set("scope", botScopes)
	q.Set("redirect_uri", s.redirectURI())

	http.Redirect(w, r, "https://slack.com/oauth/v2/authorize?"+q.Encode(), http.StatusFound)
}

func (s *Server) redirectURI() string {
	return strings.TrimSuffix(s.Cfg.AppURL, "/") + "/slack/oauth/callback"
}

type oauthResponse struct {
	OK          bool   `json:"ok"`
	Error       string `json:"error"`
	AccessToken string `json:"access_token"`
	BotUserID   string `json:"bot_user_id"`
	Scope       string `json:"scope"`
	Team        struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"team"`
	AuthedUser struct {
		ID string `json:"id"`
	} `json:"authed_user"`
}

// slackCallback exchanges the code and provisions the workspace: an org, a
// default rulebook, and the installing user as its owner.
func (s *Server) slackCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		writeErr(w, http.StatusBadRequest, "missing code")
		return
	}

	res, err := s.exchangeCode(r.Context(), code)
	if err != nil {
		s.Log.Error("slack oauth exchange", "err", err)
		writeErr(w, http.StatusBadGateway, "Slack rejected the installation")
		return
	}

	orgID := "org_slack_" + res.Team.ID

	err = s.DB.Tx(r.Context(), func(tx pgx.Tx) error {
		teamID := res.Team.ID
		if err := s.DB.CreateOrg(r.Context(), tx, domain.Org{
			ID: orgID, Name: res.Team.Name, SlackTeamID: &teamID,
		}); err != nil {
			return err
		}

		// A new workspace starts with the default rulebook rather than nothing,
		// so the first invoice has somewhere to route.
		existing, err := s.DB.Policies(r.Context(), orgID)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			for _, tier := range policy.DefaultTiers() {
				tier.ID = ids.New("pol")
				tier.OrgID = orgID
				if err := s.DB.CreatePolicy(r.Context(), tx, tier); err != nil {
					return err
				}
			}
		}

		return s.DB.SaveInstallation(r.Context(), tx, domain.SlackInstallation{
			TeamID: res.Team.ID, TeamName: res.Team.Name, OrgID: orgID,
			BotToken: res.AccessToken, BotUserID: res.BotUserID,
			InstalledBy: res.AuthedUser.ID, Scopes: res.Scope,
		})
	})
	if err != nil {
		s.fail(w, err)
		return
	}

	// The installer becomes the owner — someone has to be able to set policy,
	// and they're the only person we know about at this point.
	if err := s.seedInstaller(r.Context(), orgID, res); err != nil {
		s.Log.Error("seed installer", "err", err, "org", orgID)
	}

	s.Log.Info("slack workspace installed", "team", res.Team.Name, "org", orgID)
	http.Redirect(w, r, strings.TrimSuffix(s.Cfg.AppURL, "/")+"/?installed="+url.QueryEscape(res.Team.Name), http.StatusFound)
}

func (s *Server) exchangeCode(ctx context.Context, code string) (oauthResponse, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", s.Cfg.Slack.ClientID)
	form.Set("client_secret", s.Cfg.Slack.ClientSecret)
	form.Set("redirect_uri", s.redirectURI())

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://slack.com/api/oauth.v2.access", strings.NewReader(form.Encode()))
	if err != nil {
		return oauthResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	httpRes, err := http.DefaultClient.Do(req)
	if err != nil {
		return oauthResponse{}, err
	}
	defer httpRes.Body.Close()

	var res oauthResponse
	if err := json.NewDecoder(httpRes.Body).Decode(&res); err != nil {
		return oauthResponse{}, err
	}
	// Slack returns HTTP 200 with ok:false, so the status code alone proves
	// nothing.
	if !res.OK {
		return oauthResponse{}, fmt.Errorf("slack: %s", res.Error)
	}
	return res, nil
}

// seedInstaller adds the person who installed the app as the org's owner,
// looking up their email so a later Privy sign-in can claim the seat.
func (s *Server) seedInstaller(ctx context.Context, orgID string, res oauthResponse) error {
	profile, err := s.slackUser(ctx, res.AccessToken, res.AuthedUser.ID)
	if err != nil {
		return err
	}
	if profile.Email == "" {
		return fmt.Errorf("installer has no email on their Slack profile")
	}

	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		name := profile.RealName
		slackID := res.AuthedUser.ID
		return s.DB.UpsertMember(ctx, tx, domain.Member{
			ID: ids.New("mem"), OrgID: orgID, Email: profile.Email,
			Name: &name, SlackUserID: &slackID, Role: domain.RoleOwner,
		})
	})
}

type slackProfile struct {
	Email    string
	RealName string
}

func (s *Server) slackUser(ctx context.Context, token, userID string) (slackProfile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://slack.com/api/users.info?user="+url.QueryEscape(userID), nil)
	if err != nil {
		return slackProfile{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	httpRes, err := http.DefaultClient.Do(req)
	if err != nil {
		return slackProfile{}, err
	}
	defer httpRes.Body.Close()

	var body struct {
		OK   bool   `json:"ok"`
		Err  string `json:"error"`
		User struct {
			RealName string `json:"real_name"`
			Profile  struct {
				Email string `json:"email"`
			} `json:"profile"`
		} `json:"user"`
	}
	if err := json.NewDecoder(httpRes.Body).Decode(&body); err != nil {
		return slackProfile{}, err
	}
	if !body.OK {
		return slackProfile{}, fmt.Errorf("slack users.info: %s", body.Err)
	}
	return slackProfile{Email: body.User.Profile.Email, RealName: body.User.RealName}, nil
}
