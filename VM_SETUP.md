# VM Setup Instructions for Xendelta Hub

This guide walks you through setting up a production server for Xendelta Hub on a fresh VM instance.

## Prerequisites

- A VM instance with Ubuntu/Debian-based Linux
- Root or sudo access
- Domain name configured (e.g., `xendelta.com`)
- Firewall configured to allow HTTP (80) and HTTPS (443) traffic

## Table of Contents

0. [Automated Deploys (CI/CD)](#automated-deploys-cicd)
1. [Initial Setup](#initial-setup)
2. [Node.js Installation](#nodejs-installation)
3. [Application Setup](#application-setup)
4. [Process Management with PM2](#process-management-with-pm2)
5. [Nginx Configuration](#nginx-configuration)
6. [SSL Certificate Setup](#ssl-certificate-setup)
7. [PM2 Startup Configuration](#pm2-startup-configuration)
8. [SSH Key Setup (Optional)](#ssh-key-setup-optional)
9. [Adding Additional Subdomains](#adding-additional-subdomains)

---

## Automated Deploys (CI/CD)

Once the one-time setup below has been done, deploys are automated via
GitHub Actions and this VM should not need manual `git pull`/`pm2 restart`
day-to-day. The model:

- **Staging**: every push to an open PR (targeting `main`) triggers
  `.github/workflows/build-staging.yml`, which installs dependencies, runs
  tests and type-checking, runs `npm run build`, and force-pushes the result
  (source + freshly built `dist/`, no `node_modules`) to the `staging`
  branch. That push triggers `.github/workflows/deploy-staging.yml`, which
  SSHes into this VM, resets the `~/xendelta-hub-staging` checkout to
  `origin/staging`, runs `npm ci --omit=dev` (production dependencies only —
  no bundler or dev toolchain ever runs on this VM), and restarts the
  `xendelta-hub-staging` PM2 process.
- **Production**: publishing is manual and deliberate.
  `.github/workflows/build-prod.yml` only runs when someone triggers it by
  hand (Actions tab -> "Run workflow", or `gh workflow run build-prod.yml`),
  choosing which ref to publish. It does the same build-and-publish as
  staging, but force-pushes to the `production` branch instead, which
  triggers `.github/workflows/deploy-prod.yml` against
  `~/xendelta-hub-prod` and the `xendelta-hub` PM2 process. Pushing to `main`
  by itself does **not** deploy anything.
- Both `staging` and `production` are force-pushed on every build — treat
  their history as disposable, not something to branch protect.
- The rest of this document (manual clone, PM2, nginx, certbot) is still
  useful for the initial one-time VM bring-up and as a reference for how the
  pieces fit together, but day-to-day deploys should go through the
  workflows above rather than by hand.
- Adding a subdomain (proxied app or plain redirect) is a single command via
  `infra/gcp-vm/manage-subdomain.sh` — see
  [Adding Additional Subdomains](#adding-additional-subdomains) below.

## Initial Setup

Update the system packages:

```bash
sudo apt-get -y update
```

---

## Node.js Installation

Install Node.js 20.x:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify installation:

```bash
node -v  # Should show v20.x.x
npm -v
```

---

## Application Setup

Install Git:

```bash
sudo apt install git
```

> **For the production/staging pair driven by CI/CD** (see
> [Automated Deploys](#automated-deploys-cicd)), clone the `production` and
> `staging` branches into two separate directories instead of a single plain
> clone, so each has its own working tree, `.env`, and PM2 process:
>
> ```bash
> git clone -b production https://github.com/cgidzinski/Xendelta-Hub ~/xendelta-hub-prod
> git clone -b staging https://github.com/cgidzinski/Xendelta-Hub ~/xendelta-hub-staging
> ```
>
> The rest of this section (env vars, `npm install`, first-run `npm start`)
> applies to each of those directories individually. The single-clone
> instructions below are for a from-scratch/manual setup outside the CI/CD
> model.

Clone and set up the application:

```bash
git clone https://github.com/cgidzinski/Xendelta-Hub
cd Xendelta-Hub
```

### Environment Variables Setup

Create a `.env` file in the project root:

```bash
nano .env
```

Add the following configuration (replace with your actual values):

```env
# Server Configuration
PORT=3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/xendelta-hub
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/xendelta-hub

# Email Service Configuration
RESEND_API_KEY=your_resend_api_key_here

# JWT Configuration
JWT_SECRET=your_very_secure_random_jwt_secret_here

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://xendelta.com/api/auth/google/callback

# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://xendelta.com/api/auth/github/callback

# Google Cloud Storage Configuration
GCS_PUBLIC_BUCKET_NAME=your-public-bucket-name
GCS_PRIVATE_BUCKET_NAME=your-private-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=./gcs-service-account.json
```

> **Security Note:** Never commit the `.env` file to version control. Make sure it's listed in `.gitignore`.

### Google Cloud Storage Service Account Setup

To use Google Cloud Storage for media uploads (avatars, blog assets, etc.), you need to set up a service account:

1. **Go to Google Cloud Console:**
   - Navigate to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your project (or create a new one)

2. **Create a Service Account:**
   - Go to **IAM & Admin** → **Service Accounts**
   - Click **Create Service Account**
   - Enter a name (e.g., `xendelta-hub-storage`)
   - Click **Create and Continue**

3. **Grant Permissions:**
   - Add the role: **Storage Object Admin** (or **Storage Admin** for full access)
   - Click **Continue** and then **Done**

4. **Create and Download JSON Key:**
   - Click on the created service account
   - Go to the **Keys** tab
   - Click **Add Key** → **Create new key**
   - Select **JSON** format
   - Click **Create** (the JSON file will download automatically)

5. **Upload the JSON File to Your Server:**
   ```bash
   # Upload the file using SCP (from your local machine)
   scp path/to/your-service-account.json user@your-server:/path/to/Xendelta-Hub/gcs-service-account.json
   
   # Or create it directly on the server
   nano gcs-service-account.json
   # Paste the JSON content and save
   ```

6. **Set Proper Permissions:**
   ```bash
   chmod 600 gcs-service-account.json
   ```

7. **Create GCS Buckets:**
   - In Google Cloud Console, go to **Cloud Storage** → **Buckets**
   - Create two buckets:
     - One for public assets (e.g., `xendelta-hub-public`)
     - One for private assets (e.g., `xendelta-hub-private`)
   - Set the public bucket's permissions to allow public read access
   - Update the bucket names in your `.env` file

### Install Dependencies and Start

Install project dependencies:

```bash
npm install
```

For production, you'll start the application with PM2 (see next section), but for testing:

```bash
npm run start
```

---

## Process Management with PM2

Install PM2 globally:

```bash
cd ~/
sudo npm install -g pm2
```

> **For the production/staging pair**, use the repo's `ecosystem.config.cjs`
> instead of ad hoc `pm2 start` commands — it declares both the
> `xendelta-hub` (prod, `~/xendelta-hub-prod`) and `xendelta-hub-staging`
> (staging, `~/xendelta-hub-staging`) processes in one place, which is what
> `deploy-staging.yml`/`deploy-prod.yml` expect to find when they run
> `pm2 restart <name>`:
>
> ```bash
> cd ~/xendelta-hub-prod && pm2 start ecosystem.config.cjs --only xendelta-hub
> cd ~/xendelta-hub-staging && pm2 start ecosystem.config.cjs --only xendelta-hub-staging
> ```
>
> Both apps run in PM2 `fork` mode with a single instance each — do not
> switch either to `cluster`/multiple instances. `server.ts` has in-memory
> singletons (the scheduler, Socket.IO without a Redis adapter); multiple
> instances would duplicate scheduled jobs and break socket session
> affinity.

For a from-scratch/manual setup outside the CI/CD model, start the
application directly:

```bash
cd ~/Xendelta-Hub
pm2 start npm --name "xendelta-hub" -- start
```

PM2 will keep your application running in the background and automatically restart it if it crashes.

---

## Nginx Configuration

### Install Nginx

```bash
sudo apt-get install -y nginx
```

Check Nginx status:

```bash
sudo systemctl status nginx
```

### Create Nginx Configuration

Create the site configuration file:

```bash
sudo vi /etc/nginx/sites-available/xendelta.com.conf
```

Add the following configuration:

```nginx
# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    
    server_name xendelta.com www.xendelta.com;
    
    return 301 https://xendelta.com$request_uri;
}

# Redirect www to non-www (HTTPS)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name www.xendelta.com;
    
    ssl_certificate /etc/letsencrypt/live/xendelta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xendelta.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    return 301 https://xendelta.com$request_uri;
}

# Main HTTPS server block
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name xendelta.com;

    # SSL certificates managed by Certbot
    ssl_certificate /etc/letsencrypt/live/xendelta.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xendelta.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Increase client body size limit for file uploads (avatars, blog assets, recipaint assets, xenbox chunks)
    # Blog/recipaint assets: 50MB/10MB, Xenbox chunks: ~13-14MB base64 encoded
    client_max_body_size 100M;

    # WebSocket route
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Main application route
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/xendelta.com.conf /etc/nginx/sites-enabled/
```

Test the configuration:

```bash
sudo nginx -t
```

Reload Nginx:

```bash
sudo systemctl reload nginx
```

---

## SSL Certificate Setup

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
```

Obtain SSL certificates:

```bash
sudo certbot certonly --nginx -d xendelta.com -d www.xendelta.com
```

> **Note:** Make sure your domain DNS is properly configured before running Certbot. The certificates will be automatically renewed by Certbot.

---

## PM2 Startup Configuration

Configure PM2 to start on system boot:

```bash
pm2 startup
```

Follow the instructions provided by the command, then save the current PM2 process list:

```bash
pm2 save
```

This ensures your application will automatically start when the server reboots.

---

## SSH Key Setup (Optional)

Generate an SSH key for Git operations:

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Display your public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

Add this public key to your GitHub/GitLab account for passwordless authentication.

---

## Useful Commands

### PM2 Commands

```bash
pm2 list              # List all processes
pm2 logs              # View logs
pm2 restart all       # Restart all processes
pm2 stop all          # Stop all processes
pm2 delete all        # Delete all processes
pm2 monit             # Monitor processes
```

### Nginx Commands

```bash
sudo systemctl status nginx    # Check Nginx status
sudo systemctl restart nginx   # Restart Nginx
sudo systemctl reload nginx    # Reload configuration
sudo nginx -t                  # Test configuration
```

### SSL Certificate Renewal

Certbot automatically renews certificates, but you can test renewal manually:

```bash
sudo certbot renew --dry-run
```

---

## Adding Additional Subdomains

Use `infra/gcp-vm/manage-subdomain.sh` (ships with the repo, so it's already
present in `~/xendelta-hub-prod/infra/gcp-vm/` and
`~/xendelta-hub-staging/infra/gcp-vm/` once those checkouts exist) instead of
hand-editing nginx config. It collapses DNS-is-already-pointed-here ->
nginx config -> cert issuance -> reload into one command, using certbot's
`--nginx` plugin to add the HTTPS block and cert paths automatically instead
of the two-pass manual edit the old instructions required.

**Prerequisite** (still manual, provider-dependent): add a DNS A record for
the subdomain pointing at this VM's IP before running either command below.

### Proxy a subdomain to an app running on a local port

```bash
sudo ~/xendelta-hub-prod/infra/gcp-vm/manage-subdomain.sh add-proxy demo.xendelta.com 3001 you@example.com
```

Writes an HTTP server block proxying `/` and `/socket.io/` to
`localhost:3001` (with the same `client_max_body_size 100M` and WebSocket
upgrade headers as the main site), reloads nginx, then runs
`certbot --nginx` to add TLS and the 80->443 redirect.

### Make a subdomain redirect elsewhere

```bash
sudo ~/xendelta-hub-prod/infra/gcp-vm/manage-subdomain.sh add-redirect old.xendelta.com https://xendelta.com you@example.com
```

Same flow, but the subdomain just issues a 301 to the target URL instead of
proxying to a local app.

### Remove a subdomain

```bash
sudo ~/xendelta-hub-prod/infra/gcp-vm/manage-subdomain.sh remove demo.xendelta.com
```

Deletes the nginx config and reloads. The TLS certificate is intentionally
left in place — the command prints the `certbot delete --cert-name` command
to run separately if you also want that gone.

Both `add-proxy` and `add-redirect` refuse to overwrite an existing config
for that domain unless you pass `--force`. Run the script with no arguments
for full usage.

---

## Troubleshooting

### Application Not Starting

1. Check PM2 logs: `pm2 logs`
2. Verify Node.js version: `node -v`
3. Check if port 3000 is in use: `sudo netstat -tulpn | grep 3000`

### Nginx Issues

1. Test configuration: `sudo nginx -t`
2. Check error logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify site is enabled: `ls -la /etc/nginx/sites-enabled/`

### SSL Certificate Issues

1. Check certificate status: `sudo certbot certificates`
2. Test renewal: `sudo certbot renew --dry-run`
3. Verify DNS records are correct

---

## Security Notes

- Keep your system updated: `sudo apt-get update && sudo apt-get upgrade`
- Configure firewall rules to only allow necessary ports
- Regularly update Node.js and npm packages
- Monitor PM2 logs for any suspicious activity
- Use strong passwords and SSH keys for authentication

---

