#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# deploy/setup.sh — يوميّة VPS Setup Script (Ubuntu 22.04+)
# ═══════════════════════════════════════════════════════════════
# Usage: chmod +x deploy/setup.sh && sudo ./deploy/setup.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo "🟢 يوميّة — VPS Setup Script"
echo "================================="

# ── Node.js 20 LTS ──
echo "📦 Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "   Node.js: $(node -v)"
echo "   npm: $(npm -v)"

# ── PM2 ──
echo "📦 Installing PM2..."
sudo npm install -g pm2

# ── nginx ──
echo "📦 Installing nginx..."
sudo apt-get install -y nginx

# ── Certbot (SSL) ──
echo "📦 Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Clone repo:  git clone https://github.com/amr-abd-elsalam/yawmia.git"
echo "  2. Install deps: cd yawmia && npm install --production"
echo "  3. Create .env:  cp .env.example .env && nano .env"
echo "  4. Setup nginx:  sudo cp deploy/nginx.conf /etc/nginx/sites-available/yawmia"
echo "  5. Enable site:  sudo ln -s /etc/nginx/sites-available/yawmia /etc/nginx/sites-enabled/"
echo "  6. Get SSL:      sudo certbot --nginx -d yowmia.com -d www.yowmia.com"
echo "  7. Start app:    pm2 start ecosystem.config.cjs --env production"
echo "  8. Save PM2:     pm2 save && pm2 startup"
echo ""
