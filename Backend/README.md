# Energy Monitoring Backend — Raspberry Pi

> API Server + SQLite + Google Sheets + WebSocket  
> **Node.js 18+ · Express 4 · better-sqlite3 · ws**

---

## 📁 โครงสร้างโฟลเดอร์

```
Backend/
├── src/
│   ├── server.js                  ← Entry Point (รันตัวนี้)
│   ├── app.js                     ← Express App + Middleware
│   ├── config/
│   │   └── config.js              ← ค่า Config ทั้งหมด (โหลดจาก .env)
│   ├── database/
│   │   └── db.js                  ← SQLite Connection + Schema Init
│   ├── utils/
│   │   └── holidays.js            ← รายการวันหยุดราชการไทย (TOU Logic)
│   ├── services/
│   │   ├── touService.js          ← คำนวณค่าไฟ TOU + บันทึก DB
│   │   ├── websocketService.js    ← WebSocket Server + Broadcast
│   │   └── sheetsService.js       ← Google Sheets API Integration
│   ├── controllers/
│   │   └── energyController.js    ← Request/Response Handlers
│   └── routes/
│       └── energyRoutes.js        ← Route Definitions + API Key Auth
├── config/
│   └── google-service-account.json  ← (วางไฟล์ Service Account ที่นี่)
├── data/
│   └── energy.db                  ← SQLite Database (สร้างอัตโนมัติ)
├── .env                           ← (คัดลอกจาก .env.example แล้วแก้ค่า)
├── .env.example                   ← Template ค่า Environment
└── package.json
```

---

## ⚡ API Endpoints

| Method | Path | คำอธิบาย | Auth |
|--------|------|----------|------|
| `POST` | `/api/energy-data` | รับข้อมูลจาก ESP32 | X-API-Key |
| `GET`  | `/api/energy/latest` | ค่าล่าสุด | X-API-Key |
| `GET`  | `/api/energy/history?hours=24` | ประวัติสำหรับกราฟ | X-API-Key |
| `GET`  | `/api/energy/monthly?month=2026-07` | สรุปค่าไฟรายเดือน | X-API-Key |
| `GET`  | `/api/health` | Health Check | ❌ ไม่ต้อง |
| `WS`   | `/ws` | WebSocket Real-Time Stream | - |

---

## 🚀 การติดตั้งบน Raspberry Pi

### ขั้นตอนที่ 1 — ติดตั้ง Node.js 18+

```bash
# ใช้ NodeSource repository (รองรับ ARM)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# ตรวจสอบเวอร์ชัน
node --version    # ควรได้ v18.x.x หรือสูงกว่า
npm --version
```

### ขั้นตอนที่ 2 — Clone / Copy โปรเจกต์

```bash
# คัดลอกโฟลเดอร์ Backend ไปยัง Raspberry Pi
# (ผ่าน scp, rsync, หรือ USB)
# ตัวอย่าง scp จาก Windows:
# scp -r "D:\Workshop\Energy Monitoring System\Backend" pi@192.168.1.100:/home/pi/energy-monitor/

cd /home/pi/energy-monitor/Backend
```

### ขั้นตอนที่ 3 — ติดตั้ง Dependencies

```bash
npm install

# better-sqlite3 ต้องการ node-gyp — ติดตั้ง Build Tools ก่อน
sudo apt-get install -y python3 make g++ libsqlite3-dev
```

### ขั้นตอนที่ 4 — ตั้งค่า Environment

```bash
# คัดลอก template
cp .env.example .env

# แก้ไขค่า
nano .env
```

**ค่าสำคัญที่ต้องแก้ใน `.env`:**

```ini
PORT=8000
API_KEY=energy_monitor_secret_key_change_me   # ← ตั้งรหัสของตัวเอง
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id     # ← จาก URL ของ Google Sheet
TZ=Asia/Bangkok
```

### ขั้นตอนที่ 5 — ตั้งค่า Timezone ของ Raspberry Pi

```bash
sudo timedatectl set-timezone Asia/Bangkok
timedatectl status    # ตรวจสอบ
```

### ขั้นตอนที่ 6 — ทดสอบรัน

```bash
# รัน Development Mode
npm run dev

# หรือ Production Mode
npm start
```

ถ้าสำเร็จจะเห็น:
```
╔══════════════════════════════════════════╗
║   Energy Monitor — Backend Server       ║
╠══════════════════════════════════════════╣
║   HTTP : http://0.0.0.0:8000            ║
║   WS   : ws://0.0.0.0:8000/ws          ║
╚══════════════════════════════════════════╝
```

### ขั้นตอนที่ 7 — ทดสอบ API

```bash
# Health Check
curl http://localhost:8000/api/health

# ทดสอบ POST (Simulation)
curl -X POST http://localhost:8000/api/energy-data \
  -H "Content-Type: application/json" \
  -H "X-API-Key: energy_monitor_secret_key_change_me" \
  -d '{
    "device_id": "ESP32_MDB_01",
    "timestamp": 12345,
    "phases": {
      "L1": {"v":220.5,"a":5.12,"w":1128.9,"kwh":12.5,"hz":50.0,"pf":0.95},
      "L2": {"v":221.0,"a":4.85,"w":1071.8,"kwh":11.2,"hz":50.1,"pf":0.94},
      "L3": {"v":219.8,"a":5.20,"w":1142.9,"kwh":13.1,"hz":49.9,"pf":0.96}
    },
    "total": {"w":3343.6,"kwh":36.8}
  }'
```

---

## 🔄 ตั้ง Auto-Start ด้วย systemd (รัน Boot อัตโนมัติ)

```bash
# สร้างไฟล์ service
sudo nano /etc/systemd/system/energy-monitor.service
```

วางเนื้อหา (แก้ Path ตามจริง):
```ini
[Unit]
Description=Energy Monitor Backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/energy-monitor/Backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=TZ=Asia/Bangkok

[Install]
WantedBy=multi-user.target
```

```bash
# เปิดใช้งาน
sudo systemctl daemon-reload
sudo systemctl enable energy-monitor
sudo systemctl start energy-monitor

# ตรวจสอบสถานะ
sudo systemctl status energy-monitor

# ดู Log แบบ Real-Time
sudo journalctl -u energy-monitor -f
```

---

## 📊 การตั้งค่า Google Sheets API

### ขั้นตอนที่ 1 — สร้าง Service Account

1. เปิด [Google Cloud Console](https://console.cloud.google.com/)
2. สร้าง Project ใหม่หรือใช้ Project ที่มีอยู่
3. ไปที่ **APIs & Services → Enable APIs** → เปิดใช้ **Google Sheets API**
4. ไปที่ **IAM & Admin → Service Accounts → Create Service Account**
5. กด **Create Key → JSON** → ดาวน์โหลดไฟล์

### ขั้นตอนที่ 2 — วางไฟล์ Key

```bash
# วางไฟล์ JSON Key ไว้ที่
/home/pi/energy-monitor/Backend/config/google-service-account.json
```

### ขั้นตอนที่ 3 — แชร์ Google Sheet

1. สร้าง Google Spreadsheet ใหม่
2. คัดลอก Spreadsheet ID จาก URL:  
   `docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`
3. กด **Share** → ใส่ Email ของ Service Account (ดูในไฟล์ JSON ที่ field `client_email`)
4. ให้สิทธิ์ **Editor**

### ขั้นตอนที่ 4 — ตั้งค่า .env

```ini
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./config/google-service-account.json
GOOGLE_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
GOOGLE_SHEET_NAME=EnergyData
GOOGLE_DAILY_SHEET_NAME=DailySummary
```

---

## 💾 Database Schema

```sql
energy_readings    -- Raw readings ทุก 2 วินาที (เก็บ 90 วัน)
monthly_cost       -- ยอดสะสมค่าไฟรายเดือน (Peak/Off-Peak)
daily_summary      -- สรุปรายวัน (ส่งไป Google Sheets)
kwh_tracker        -- ค่า kWh ล่าสุดสำหรับคำนวณ Delta
```

---

## 🔧 TOU Tariff (อัตราค่าไฟฟ้า)

| ช่วง | เงื่อนไข | อัตรา |
|------|---------|-------|
| **Peak** | จ-ศ · 09:00–22:00 (รวมวันพืชมงคล) | **4.1025 บาท/kWh** |
| **Off-Peak** | จ-ศ · 22:00–09:00 + ส-อ ทั้งวัน + วันหยุดราชการ | **2.5849 บาท/kWh** |
| **ค่าบริการ** | คงที่ต่อเดือน | **312.24 บาท** |

> อัตราตาม MEA/PEA ประเภทที่ 3 กิจการขนาดเล็ก แรงดัน 22 kV  
> สามารถแก้ไขค่าได้ใน `.env` (TOU_PEAK_RATE, TOU_OFF_PEAK_RATE)

---

## 📈 ค่า Demand และยอดเรียกเก็บใน Google Sheets

ระบบเก็บ `max_demand_kw` จากกำลังไฟรวมสูงสุดที่วัดได้ในเดือนนั้น และคิดค่า
Demand ด้วย `max_demand_kw × DEMAND_RATE` โดยค่าเริ่มต้น `DEMAND_RATE=132.93`
บาท/kW ตามตัวอย่างใบแจ้งค่าไฟ

Dashboard จะแสดงเฉพาะยอดฐาน:

```text
ค่าพลังงานสะสมตาม TOU + (Demand kW สูงสุด × อัตรา Demand)
```

ทุกชั่วโมง Backend จะอัปเดต Sheet `MonthlyBilling` (แก้ชื่อได้ด้วย
`GOOGLE_MONTHLY_SHEET_NAME`) ซึ่งคำนวณต่อด้วยสูตร:

```text
Dashboard Total + (kWh รวม × Ft) + ค่าบริการ = Sub Total
Sub Total × VAT = VAT
Sub Total + VAT = Grand Total
```

กำหนดอัตราได้ใน `Backend/.env`:

```ini
DEMAND_RATE=132.93
FT_RATE=0
TOU_SERVICE_CHARGE=312.24
VAT_RATE=0.07
```

> `.env` ใช้เป็นค่าเริ่มต้นเมื่อสร้างฐานข้อมูลเท่านั้น หลังจากนั้นสามารถแก้
> Peak, Off-Peak, Demand, Ft, ค่าบริการ และ VAT จากปุ่ม ⚙ บน Dashboard ได้เลย
> โดยระบบบันทึกค่าไว้ใน SQLite และใช้งานทันทีโดยไม่ต้อง restart

> ค่า Demand ในเวอร์ชันนี้คือค่าสูงสุดจากกำลังไฟที่อ่านได้ทุก 2 วินาที
> หากต้องการให้เทียบเท่าบิลการไฟฟ้า อาจต้องกำหนดวิธีคิดเป็นค่าเฉลี่ยตามช่วง
> Demand ของผู้ให้บริการไฟฟ้าอีกครั้ง

### สรุปรายวัน

ทุกชั่วโมง Backend จะสร้างหรืออัปเดตแท็บ `DailySummary` (เปลี่ยนชื่อได้ด้วย
`GOOGLE_DAILY_SHEET_NAME`) ให้มีหนึ่งแถวต่อหนึ่งวัน ประกอบด้วย Peak/Off-Peak
kWh, ค่า Energy, กำลังสูงสุด, Demand rate และยอด Dashboard ของวันนั้น

คอลัมน์ `Demand Cost` และ `Dashboard Total` ในแท็บรายวันเป็น **ค่าอ้างอิงของวัน**
สำหรับดูแนวโน้มเท่านั้น ห้ามนำไปบวกรวมข้ามวันเพื่อออกบิล เพราะค่า Demand ที่ถูกต้อง
คิดจากกำลังสูงสุดของทั้งเดือนเพียงครั้งเดียวใน `MonthlyBilling`.

---

## 📡 WebSocket — การเชื่อมต่อจาก Frontend

```javascript
// เชื่อมต่อ WebSocket จาก Browser
const ws = new WebSocket('ws://192.168.1.100:8000/ws');

ws.onopen = () => console.log('Connected!');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'energy_update') {
    console.log('ข้อมูลใหม่:', msg.data);
    // msg.data มีโครงสร้างเหมือน JSON จาก ESP32
    // + เพิ่ม msg.data.tou และ msg.data.monthly_cost
  }
};
```

---

## 🔑 อัปเดต API Key ใน ESP32 Firmware

หลังจากตั้ง API_KEY ใน `.env` แล้ว ต้องอัปเดตใน Firmware ด้วย:

```cpp
// ใน ESP32_EnergyMonitor.ino — ฟังก์ชัน sendHttpPost()
const char* API_KEY = "energy_monitor_secret_key_change_me";
http.addHeader("X-API-Key", API_KEY);
// ← เปลี่ยน API_KEY ให้ตรงกับค่าใน .env
```
