# يوميّة — Deployment Guide (v0.21.0)

## Prerequisites

- Ubuntu 22.04+ VPS (1GB RAM minimum, 2GB recommended)
- Domain pointing to VPS IP (A record: `yowmia.com` → VPS IP)
- SSH access to VPS

## 1. VPS Setup

```bash
# Upload and run setup script
chmod +x deploy/setup.sh
sudo ./deploy/setup.sh
