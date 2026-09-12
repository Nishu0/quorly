// Package store owns the database: the pool, migrations, and every query.
package store

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// Tx runs fn inside a transaction, rolling back on error or panic.
//
// This is what makes the outbox work: the business write and the job that
// follows from it commit together or not at all.
func (s *Store) Tx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		_ = tx.Rollback(context.WithoutCancel(ctx))
		return err
	}
	return tx.Commit(ctx)
}

// Migrate applies every embedded migration once, in filename order.
func (s *Store) Migrate(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		var applied bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)`, name,
		).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}

		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}

		if err := s.Tx(ctx, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(body)); err != nil {
				return fmt.Errorf("apply %s: %w", name, err)
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}
