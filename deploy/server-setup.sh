#!/bin/bash
set -euo pipefail

# =============================================================================
# AES production droplet bootstrap.
# Run ONCE on a fresh Ubuntu 24.04 droplet as root:
#   ssh root@<DROPLET_IP> 'bash -s' < deploy/server-setup.sh
#
# Afterwards:
#   1. Add the CI deploy key's PUBLIC half to /home/deploy/.ssh/authorized_keys
#      (the private half is the DO_SSH_KEY GitHub secret).
#   2. Put deploy/compose.prod.yml + deploy/nginx/ under /opt/aes/ (the deploy
#      workflow scp's these), and create /opt/aes/.env from .env.production.example.
#   3. Add this droplet to the Managed Postgres cluster's Trusted Sources.
# =============================================================================

echo "=== AES droplet setup ==="

echo "--- Updating system ---"
apt-get update && apt-get upgrade -y

echo "--- Installing essentials ---"
apt-get install -y ca-certificates curl gnupg lsb-release ufw fail2ban htop unzip git

echo "--- Installing Docker + compose plugin ---"
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
docker --version && docker compose version

echo "--- Creating deploy user ---"
if ! id deploy &>/dev/null; then
  useradd -m -s /bin/bash -G docker deploy
  mkdir -p /home/deploy/.ssh
  # Seed with root's keys so you can log in as deploy immediately; replace with
  # the dedicated CI deploy key afterwards.
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys 2>/dev/null || true
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true
  echo "deploy ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/deploy
fi

echo "--- Firewall (UFW) ---"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "--- fail2ban (sshd) ---"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 3
bantime = 3600
findtime = 600
EOF
systemctl enable fail2ban && systemctl restart fail2ban

echo "--- Swap (2G — lets a 1-2GB droplet survive image pulls) ---"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "--- App directory ---"
mkdir -p /opt/aes/nginx/ssl /opt/aes/nginx/certbot
chown -R deploy:deploy /opt/aes

echo "--- Hardening SSH (key-only, no root password login) ---"
sed -i 's/#\?PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#\?PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

timedatectl set-timezone UTC

echo "--- Docker log rotation ---"
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
systemctl restart docker

echo ""
echo "=== Setup complete. Next: ==="
echo "  1. Put the CI deploy public key in /home/deploy/.ssh/authorized_keys"
echo "  2. Create /opt/aes/.env from deploy/.env.production.example"
echo "  3. Add this droplet IP to the Managed Postgres Trusted Sources"
echo "  4. Set DEPLOY_ENABLED=true and run the Deploy workflow"
