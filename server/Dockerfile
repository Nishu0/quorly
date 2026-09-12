# ---- build ----------------------------------------------------------------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependencies first: they change far less often than source, so this layer
# survives most rebuilds.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Static binary — the runtime image has no libc to link against.
RUN CGO_ENABLED=0 GOOS=linux go build \
      -ldflags="-s -w" \
      -o /out/quorly ./cmd/quorly \
 && CGO_ENABLED=0 GOOS=linux go build \
      -ldflags="-s -w" \
      -o /out/quorlyctl ./cmd/quorlyctl

# ---- runtime --------------------------------------------------------------
FROM alpine:3.22

# ca-certificates for TLS to Privy, World, Slack and Neon; tzdata so timestamps
# in the audit trail are meaningful.
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 quorly

COPY --from=build /out/quorly /usr/local/bin/quorly
COPY --from=build /out/quorlyctl /usr/local/bin/quorlyctl

USER quorly
EXPOSE 8080

# Migrations are applied by the server on boot, so a fresh container is enough.
ENTRYPOINT ["/usr/local/bin/quorly"]
