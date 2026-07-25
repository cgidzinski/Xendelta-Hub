# Home Server Setup — Reference

Final working state as of this build. Single Proxmox host, Cloudflare Tunnel for zero-open-ports ingress, Traefik for routing multiple domains/projects behind it.

## Architecture

```
Internet
   │
Cloudflare (DNS + Tunnel edge, TLS termination)
   │  outbound-only, no open ports on the WAN
   ▼
UniFi (WebServer VLAN, isolated from trusted LAN except admin access)
   │
┌─────────────────────────────────────────────┐
│ Proxmox host — 192.168.4.20                  │
│                                               │
│  CT 100: cloudflared — 192.168.4.21          │
│         │                                    │
│  CT: Traefik — 192.168.4.22                  │
│         │  routes by hostname (dynamic config files)│
│  ┌──────┴─────────┬────────────┐             │
│  │ Project A       │ Project B  │  ...        │
│  │ (own CT/VM, exposes IP:port, no shared net)│
│  └────────────────────────────────────────────┘
└───────────────────────────────────────────────┘
```

## Port reference

Keep this updated as new projects are added — one place to check what's running where.

| Service | Host | Port | Reached via |
|---|---|---|---|
| Proxmox web UI | `192.168.4.20` | `8006` | Tailscale only |
| Proxmox SSH | `192.168.4.20` | `22` | Tailscale only |
| Traefik entrypoint (`web`) | `192.168.4.22` | `80` | Cloudflare Tunnel (public) |
| Traefik dashboard | `192.168.4.22` | `8080` | Tailscale only |
| *(add a row per project as they're deployed)* | | | |

## Network (UniFi)

- **WebServer VLAN**: `192.168.4.0/24`, gateway `192.168.4.1`
- **Network Isolation** enabled on the WebServer network — blocks WebServer ↔ trusted LAN both directions, with **no exceptions**
- Outbound WebServer → Internet: allowed (needed for the tunnel, updates, NTP, etc.)
- No IP-based admin exception rules — admin access goes through Tailscale instead (see below)
- Domain DNS: hosted on Cloudflare (nameservers pointed there from Namecheap registrar)

## Admin access — Tailscale

Installed directly on the Proxmox host (`192.168.4.20`) as a **subnet router**, so one install covers admin access to the whole `192.168.4.0/24` VLAN rather than needing Tailscale on every CT.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
echo 'net.ipv6.conf.all.forwarding = 1' >> /etc/sysctl.conf
sysctl -p
tailscale up --advertise-routes=192.168.4.0/24 --accept-dns=false
```
Route approved in the Tailscale admin console (`login.tailscale.com/admin/machines` → `pve` → enable the subnet route). Admin PC also joined the same tailnet, with "accept subnet routes" enabled.

**Why Tailscale instead of a UniFi IP exception:** an IP-based rule authenticates a *device's IP*, not a *person* — anything that could reach that IP on the LAN would have the same access. Tailscale authenticates the *device itself* via WireGuard keys tied to the tailnet account (inheriting whatever 2FA that account has), so the WebServer VLAN stays fully isolated with zero firewall holes — access depends on being an authenticated tailnet peer, not on network position.

**No open ports involved** — same outbound-only/NAT-traversal model as the Cloudflare Tunnel, consistent with the rest of the build.

### Tailscale ACL — restrict who can reach the WebServer subnet

By default, Tailscale allows every device on the tailnet to reach every other device, including an advertised subnet route — looser than intended for a route into the WebServer network. Lock it down to just the admin account:

1. Tag the subnet router:
   ```bash
   tailscale up --advertise-routes=192.168.4.0/24 --advertise-tags=tag:webserver-router --accept-dns=false
   ```
2. Edit the policy at `login.tailscale.com/admin/acls`:
   ```json
   {
     "tagOwners": {
       "tag:webserver-router": ["your-email@example.com"]
     },
     "acls": [
       {
         "action": "accept",
         "src": ["your-email@example.com"],
         "dst": ["tag:webserver-router:*", "192.168.4.0/24:*"]
       }
     ]
   }
   ```
   Only the listed account can reach the router node or anything on the advertised subnet — everything else is deny-by-default.
3. Confirm the `pve` node shows `tag:webserver-router` in the admin console, with the subnet route still approved.
4. Test: admin PC should still reach `192.168.4.20:8006`; any other tailnet device/account should not.

## Proxmox host — `192.168.4.20`

- Proxmox VE, static IP as above, `local`/`local-lvm` default storage split
- Base OS is Debian trixie on this box, which uses the newer **deb822 `.sources` format** for apt repos (`/etc/apt/sources.list.d/*.sources`), not the old one-line `deb ...` `.list` format
- Enterprise repos disabled by adding `Enabled: no` to their blocks, rather than commenting out a `deb` line:
  ```bash
  sed -i '/^Types:/i Enabled: no' /etc/apt/sources.list.d/pve-enterprise.sources
  sed -i '/^Types:/i Enabled: no' /etc/apt/sources.list.d/ceph.sources
  ```
- No-subscription repo added in the same deb822 format:
  ```bash
  cat > /etc/apt/sources.list.d/pve-no-subscription.sources << 'EOF'
  Types: deb
  URIs: http://download.proxmox.com/debian/pve
  Suites: trixie
  Components: pve-no-subscription
  Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
  EOF
  ```
- Debian 12 LXC template used for all containers below
- Per-container network config: **no VLAN tag** — VLAN separation happens at the UniFi switch port (untagged/native), not inside Proxmox

## CT 100 — cloudflared — `192.168.4.21`

Installed via Cloudflare's apt repo. Config at `/etc/cloudflared/config.yml` (note: the *service* reads from `/etc/cloudflared/`, not `/root/.cloudflared/` where `tunnel login`/`tunnel create` initially write):

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: "*.evg31337.com"
    service: http://192.168.4.22:80
  - service: http_status:404
```

Running as a systemd service (`cloudflared service install`, `systemctl enable --now cloudflared`).

DNS routed with:
```bash
cloudflared tunnel route dns WebServer "*.evg31337.com"
```

## Traefik CT — `192.168.4.22`

Docker + Docker Compose. **Image pinned to `traefik:v3.6`** — v3.1 has a known bug where its Docker SDK client hardcodes API version 1.24, which breaks against Docker Engine 29+ (minimum supported API 1.40/1.44). v3.6 added auto-negotiation and fixes this.

`/opt/traefik/traefik.yml` — **file provider only.** Every project, Docker or not, is routed the same way: a static config file per project pointing at its IP:port. No Docker labels, no shared Docker network, no `docker.sock` mount needed.
```yaml
entryPoints:
  web:
    address: ":80"
  traefik:
    address: ":8080"

providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true

api:
  dashboard: true
  insecure: true
```

`/opt/traefik/docker-compose.yml`:
```yaml
services:
  traefik:
    image: traefik:v3.6
    command: --configFile=/etc/traefik/traefik.yml
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /opt/traefik/traefik.yml:/etc/traefik/traefik.yml
      - /opt/traefik/dynamic:/etc/traefik/dynamic
    restart: unless-stopped
```
```bash
mkdir -p /opt/traefik/dynamic
```

Dashboard (internal only, not exposed through the tunnel): `http://192.168.4.22:8080/dashboard/`

## HTTPS

Handled entirely by Cloudflare at the edge — no certs to manage. Browser↔Cloudflare is HTTPS automatically; Cloudflare↔cloudflared is encrypted by the tunnel protocol itself; cloudflared↔Traefik↔app is plain HTTP and never leaves the LAN. Traefik only needs its `web` entrypoint on port 80.

---

## How to add a new domain

1. Add the domain to Cloudflare (Add a Site → Free plan), point its registrar's nameservers at the two Cloudflare gives you.
2. Once it shows **Active** in Cloudflare, add an ingress rule to `/etc/cloudflared/config.yml` on CT 100:
   ```yaml
   ingress:
     - hostname: "*.evg31337.com"
       service: http://192.168.4.22:80
     - hostname: "*.newdomain.com"
       service: http://192.168.4.22:80
     - service: http_status:404
   ```
3. Route DNS for it:
   ```bash
   cloudflared tunnel route dns WebServer "*.newdomain.com"
   ```
4. Restart cloudflared: `systemctl restart cloudflared`
5. Any project's Traefik label can now use `Host(\`something.newdomain.com\`)` and it'll route the same way as everything else — one tunnel, one Traefik instance, any number of domains.

**Bare/apex domain (no subdomain) needs its own separate entry** — `*.newdomain.com` only covers subdomains; it does **not** cover `newdomain.com` by itself. If you want the bare domain to work too (e.g. `evg31337.com`, not just `staging.evg31337.com`), add a second ingress line and a second route:
```yaml
ingress:
  - hostname: "newdomain.com"
    service: http://192.168.4.22:80
  - hostname: "*.newdomain.com"
    service: http://192.168.4.22:80
  - service: http_status:404
```
```bash
cloudflared tunnel route dns WebServer "newdomain.com"
systemctl restart cloudflared
```
**Common snag:** if Cloudflare's initial site scan (step 1) already created an `A`/`AAAA` record for the bare domain, the route command fails with `An A, AAAA, or CNAME record with that host already exists`. Delete that existing record first — Cloudflare dashboard → DNS → Records → find the one named `newdomain.com` (or `@`) → delete — then retry the route command.

## How to add a new project

Every project — Docker or not — is routed the same way: run it on its own CT/VM (or its own port on a shared one) at a static IP, and drop a config file into `/opt/traefik/dynamic/` on the Traefik CT pointing at its `IP:port`. `watch: true` means Traefik picks it up live, no restart needed.

### Case 1 — Docker

1. Create a new LXC/VM on Proxmox, static IP on `192.168.4.0/24`, no VLAN tag. Install Docker: `curl -fsSL https://get.docker.com | sh`
2. Publish the container's port normally in `docker-compose.yml` — no labels, no shared network needed:
   ```yaml
   services:
     myproject:
       build: .
       ports:
         - "3000:3000"
       restart: unless-stopped
   ```
   ```bash
   docker compose up -d
   ```
3. On the Traefik CT, add a routing file — say this project's CT is `192.168.4.30`:
   ```bash
   nano /opt/traefik/dynamic/myproject.yml
   ```
   ```yaml
   http:
     routers:
       myproject:
         rule: "Host(`myproject.evg31337.com`)"
         service: myproject
         entryPoints:
           - web

     services:
       myproject:
         loadBalancer:
           servers:
             - url: "http://192.168.4.30:3000"
   ```
4. Confirm it shows up in the Traefik dashboard under HTTP Routers (`myproject@file`), then test locally with a Host-header curl, then externally.
5. If the hostname's domain isn't already covered by an existing wildcard ingress rule, add it per "How to add a new domain" above.

### Prerequisites for any PM2/Node project on a fresh CT

Debian 12 templates don't come with Node, npm, or PM2 — install once per CT:
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt install -y nodejs npm git
npm install -g pm2
```
Confirm: `node -v && npm -v`

**Enable PM2 auto-startup on boot — one-time per CT, do this before adding the first app:**
```bash
pm2 startup
```
This prints a `systemctl enable ...` command tailored to this box — copy and run exactly what it prints (don't guess at it, the generated command includes the correct user/path). After that, any time you add or change a process:
```bash
pm2 save
```
`pm2 save` snapshots the current process list; on reboot, the systemd service `pm2 startup` registered restores exactly what was saved. Skipping `pm2 save` after adding a new app means it won't survive a reboot even though `pm2 startup` itself is already configured.

### Case 2 — No Docker, frontend and backend as separate services

Run each half as its own process — either on separate CTs, or the same CT on two different ports. **Use `pm2 start npm -- run start`** rather than pointing PM2 directly at a script file — this runs the project's actual `npm run start` script, which picks up whatever interpreter/env-loading the project already expects instead of PM2 guessing:
```bash
# frontend
cd /opt/myapp-frontend
pm2 start npm --name myapp-fe -- run start
# backend
cd /opt/myapp-backend
pm2 start npm --name myapp-be -- run start
pm2 save
pm2 startup
```

Route by path on the same hostname, using two routers against two services:
```yaml
http:
  routers:
    myapp-fe:
      rule: "Host(`myapp.evg31337.com`)"
      service: myapp-fe
      entryPoints:
        - web

    myapp-be:
      rule: "Host(`myapp.evg31337.com`) && PathPrefix(`/api`)"
      service: myapp-be
      priority: 10
      entryPoints:
        - web

  services:
    myapp-fe:
      loadBalancer:
        servers:
          - url: "http://192.168.4.31:80"

    myapp-be:
      loadBalancer:
        servers:
          - url: "http://192.168.4.32:4000"
```
The `priority: 10` on the backend router matters — it must outrank the frontend's catch-all rule, or API requests fall through to the frontend router first and 404/serve HTML instead of hitting the API. Same origin, same domain, no CORS issues either way. (Point each service's `url` at wherever it actually runs — same CT with different ports, or separate CTs entirely. **Double check the port in the routing file matches the port the app is actually listening on** — a mismatch here is the most common cause of a Bad Gateway from Traefik.)

### Case 3 — No Docker, frontend and backend combined

Simplest option when you don't need them to scale independently: have the backend (Express, etc.) serve the built React static files *and* the API from the same process, so it's just one PM2 process on one port:
```js
app.use(express.static('build'));
app.get('/api/...', apiHandler);
app.get('*', (req, res) => res.sendFile('build/index.html')); // SPA fallback for client-side routing
```
```bash
cd /opt/myapp
pm2 start npm --name myapp -- run start
pm2 save
pm2 startup
```
Routing file — same single-service pattern as Case 1:
```yaml
http:
  routers:
    myapp:
      rule: "Host(`myapp.evg31337.com`)"
      service: myapp
      entryPoints:
        - web

  services:
    myapp:
      loadBalancer:
        servers:
          - url: "http://192.168.4.30:3000"
```

**Reminder for every new project, regardless of type:**
- Just needs to be reachable at `IP:port` from the Traefik CT — every LXC/VM is on the same `192.168.4.0/24` subnet by default, so this works with no extra networking setup
- Check the dashboard after adding the config file to confirm the router actually registered (`@file` suffix) before testing externally
- Use the real domain in the `Host()` rule, not a placeholder
