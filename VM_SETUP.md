# VM Setup Instructions for Xendelta Hub

This guide walks you through setting up a production server for Xendelta Hub on a fresh VM instance.

## Prerequisites

- A VM instance with Ubuntu/Debian-based Linux
- Root or sudo access
- Domain name configured (e.g., `xendelta.com`)
- Firewall configured to allow HTTP (80) and HTTPS (443) traffic

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Node.js Installation](#nodejs-installation)
3. [Application Setup](#application-setup)
4. [Process Management with PM2](#process-management-with-pm2)
5. [Nginx Configuration](#nginx-configuration)
6. [SSL Certificate Setup](#ssl-certificate-setup)
7. [PM2 Startup Configuration](#pm2-startup-configuration)
8. [SSH Key Setup (Optional)](#ssh-key-setup-optional)

---

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
CLIENT_URL=https://xendelta.com

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/xendelta-hub
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/xendelta-hub

# Email Service Configuration
SENDGRID_API_KEY=your_sendgrid_api_key_here
# OR use Resend instead:
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

Start your application with PM2:

```bash
pm2 start server.js
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

    # WebSocket route
    location /ws/ {
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

    # Additional app routes can be added here
    # Example:
    # location /app2/ {
    #     proxy_pass http://localhost:3001;
    #     proxy_http_version 1.1;
    #     proxy_set_header Upgrade $http_upgrade;
    #     proxy_set_header Connection "upgrade";
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #     proxy_set_header X-Forwarded-Proto $scheme;
    #     proxy_read_timeout 86400;
    # }
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

