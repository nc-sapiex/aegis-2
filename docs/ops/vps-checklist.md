# VPS Go-Live Checklist (vps-control)

Replaces the AWS checklist for deployments hosted on our own VPS
(Hostinger + Tailscale, per `CLAUDE.md`) instead of AWS. Run once, manually,
before go-live — the automated drills (install, restore) cover the
repeatable parts; this covers the parts specific to the real box and the
real customer.

**Target:** `vps-control` (Hostinger KVM 4, Ubuntu 24.04, public IP
`187.124.97.7`), fronted by the Coolify-managed Traefik instance already
running there (`coolify-proxy`). No new reverse-proxy stack — `edge-caddy`
and `sslh` stay stopped, per `CLAUDE.md`.

## Database

- [ ] Postgres runs as a container on vps-control, not exposed on any
      public port (`docker-compose.vps.yml` resets `ports` to none) —
      confirm with `docker compose ps` that no `0.0.0.0:5432->...` mapping
      exists.
- [ ] `pnpm db:bootstrap` run once after first `up`, RLS policies and audit
      triggers confirmed attached (`pnpm db:verify`).
- [ ] `scripts/backup.sh` scheduled via cron on vps-control, retention
      matches spec §8.5's 30-day equivalent.
- [ ] Backups copied off-box (no S3 here — `scp` to vps-worker, or a
      Hostinger VM snapshot) since there's no managed PITR to fall back on.
- [ ] A restore actually tested against a scratch copy on this box, not
      assumed from the install-drill's restore-drill alone (different
      host, different Postgres install).

## Object storage

- [ ] MinIO runs as a container, `ports` reset to none — the app reaches
      it at `minio:9000` over the compose network only, never from the
      public internet.
- [ ] `MINIO_ROOT_PASSWORD` is a real generated secret, not a repo default.
- [ ] Evidence bucket (`S3_BUCKET_NAME`) versioning/lifecycle equivalent —
      MinIO's own versioning, if the customer's retention terms require it.

## Network and TLS

- [ ] `aegis.sapiex.tech` A record points at `187.124.97.7` (done —
      `DNS_updateDNSRecordsV1`, 2026-09-16).
- [ ] `docker-compose.vps.yml`'s Traefik labels verified against the
      live `coolify-proxy` config (`docker inspect coolify-proxy` for the
      actual network name and cert resolver) — written from Coolify's
      documented defaults, **not yet confirmed live** (SSH to vps-control
      was unreachable when this was drafted).
- [ ] `ufw status` on vps-control: only 80, 443, 22 open publicly; DB/MinIO
      ports never opened.
- [ ] Traefik issues a valid Let's Encrypt cert for `aegis.sapiex.tech`
      (check via browser or `curl -vI https://aegis.sapiex.tech`).

## Application

- [ ] `NEXT_PUBLIC_APP_URL=https://aegis.sapiex.tech` — baked into the
      Docker image at build time (`docker-compose.yml`'s `app.build.args`),
      so this must be right _before_ the first build, not patched after.
- [ ] `BETTER_AUTH_URL` matches the same hostname (`src/lib/auth.ts`'s
      `trustedOrigins` is built from this — a mismatch here reproduces the
      exact login-redirect failure root-caused in the install drill this
      session, see `docs/ops/install-drill-log.md`).
- [ ] Production `license.aegis` issued for `aegis.sapiex.tech`, not a
      drill/staging license — `allowedHosts` is an exact match, no globs.
- [ ] `expiresAt`/`gracePeriodDays` match the signed contract terms.
- [ ] `MAIL_DRIVER=smtp` points at a real relay, not MailHog (still
      undecided — see the deployment-planning discussion; MailHog stays
      internal-only either way per `docker-compose.vps.yml`).

## Verification

- [ ] Install drill run against this exact overlay
      (`docker-compose.vps.yml`), not just the on-prem one, at least once
      before the real deploy.
- [ ] `docs/ops/install-drill-log.md` / `restore-drill-log.md` have a real
      entry for this host, not just the Multipass drill VM.
- [ ] Checklist run date: **\_\_\_\_\_\_\_\_\_\_**
- [ ] Run by: **\_\_\_\_\_\_\_\_\_\_**

## Not covered here

Field-level encryption, external anchoring of the audit chain, and
penetration testing — spec §13, after go-live. Disk-level encryption at
rest is vps-control's/Hostinger's responsibility, not AEGIS's; see
`docs/ops/security-statement.md`.
