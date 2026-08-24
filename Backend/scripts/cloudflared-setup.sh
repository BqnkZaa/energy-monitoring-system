#!/bin/bash
# =============================================================
#  cloudflared-setup.sh
#  ติดตั้ง Cloudflare Tunnel บน Raspberry Pi
#  รองรับ: Raspberry Pi OS (Bookworm/Bullseye) 32-bit และ 64-bit
#
#  วิธีใช้:
#    chmod +x cloudflared-setup.sh
#    ./cloudflared-setup.sh
# =============================================================

set -e  # หยุดทันทีถ้ามี error

# ── Colors ─────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Cloudflare Tunnel — Setup Script           ║"
echo "║   Energy Monitor (Raspberry Pi)              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── ตรวจสอบ Architecture ────────────────────────────────────
ARCH=$(uname -m)
log_info "ตรวจสอบ Architecture: $ARCH"

case "$ARCH" in
  x86_64)   CF_ARCH="amd64"   ;;
  aarch64)  CF_ARCH="arm64"   ;;
  armv7l)   CF_ARCH="arm"     ;;
  armv6l)   CF_ARCH="arm"     ;;
  *)
    log_error "Architecture ไม่รองรับ: $ARCH"
    exit 1
    ;;
esac

log_ok "ใช้ Binary: linux-$CF_ARCH"

# ── ดาวน์โหลด cloudflared ───────────────────────────────────
CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
CF_BIN="/usr/local/bin/cloudflared"

log_info "กำลังดาวน์โหลด cloudflared..."
sudo curl -fsSL "$CF_URL" -o "$CF_BIN"
sudo chmod +x "$CF_BIN"

# ── ตรวจสอบ version ─────────────────────────────────────────
CF_VERSION=$("$CF_BIN" --version 2>&1 | head -1)
log_ok "ติดตั้งสำเร็จ: $CF_VERSION"

# ── สร้าง systemd Service ───────────────────────────────────
log_info "กำลังสร้าง systemd service..."

sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<'EOF'
[Unit]
Description=Cloudflare Tunnel — Energy Monitor Backend
Documentation=https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
After=network-online.target energy-monitor.service
Wants=network-online.target
Requires=energy-monitor.service

[Service]
Type=simple
User=pi
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:8000 \
          --no-autoupdate \
          --loglevel info \
          --logfile /var/log/cloudflared.log
Restart=on-failure
RestartSec=15
# จับ URL ที่ได้ลง log ด้วย
StandardOutput=journal
StandardError=journal
Environment=TERM=xterm

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
log_ok "สร้าง service: cloudflared-tunnel.service"

# ── สร้าง Log file ───────────────────────────────────────────
sudo touch /var/log/cloudflared.log
sudo chown pi:pi /var/log/cloudflared.log
log_ok "สร้าง log file: /var/log/cloudflared.log"

# ── สร้าง Helper Script ─────────────────────────────────────
sudo tee /usr/local/bin/tunnel-url > /dev/null <<'SCRIPT'
#!/bin/bash
# แสดง Cloudflare Tunnel URL ปัจจุบัน
echo "🔍 กำลังหา Tunnel URL..."
URL=$(sudo journalctl -u cloudflared-tunnel --since "5 minutes ago" -n 100 --no-pager 2>/dev/null \
      | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' \
      | tail -1)

if [ -z "$URL" ]; then
  URL=$(cat /var/log/cloudflared.log 2>/dev/null \
        | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' \
        | tail -1)
fi

if [ -z "$URL" ]; then
  echo "❌ ยังไม่พบ URL — รอสัก 10-15 วินาที แล้วลองใหม่"
  echo "   ดู Log: sudo journalctl -u cloudflared-tunnel -f"
else
  WSS_URL="${URL/https:\/\//wss://}/ws"
  echo ""
  echo "✅ Cloudflare Tunnel URL:"
  echo "   HTTPS: $URL"
  echo "   WSS:   $WSS_URL"
  echo ""
  echo "📋 Copy ค่านี้ไปใส่ Vercel Environment Variable:"
  echo "   NEXT_PUBLIC_WS_URL = $WSS_URL"
  echo ""
fi
SCRIPT

sudo chmod +x /usr/local/bin/tunnel-url
log_ok "สร้าง helper command: tunnel-url"

# ── เสร็จสิ้น ────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ ติดตั้ง Cloudflare Tunnel สำเร็จ!                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  คำสั่งที่ใช้บ่อย:                                       ║"
echo "║                                                           ║"
echo "║  เปิด Tunnel ตอนนี้เลย (1 ครั้ง):                         ║"
echo "║    sudo systemctl start cloudflared-tunnel               ║"
echo "║                                                           ║"
echo "║  ตั้ง Auto-Start ทุกครั้งที่บูต:                            ║"
echo "║    sudo systemctl enable cloudflared-tunnel              ║"
echo "║                                                           ║"
echo "║  ดู URL ที่ได้:                                            ║"
echo "║    tunnel-url                                             ║"
echo "║                                                           ║"
echo "║  ดู Log แบบ Real-Time:                                    ║"
echo "║    sudo journalctl -u cloudflared-tunnel -f              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
