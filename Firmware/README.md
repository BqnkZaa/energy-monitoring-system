# Phase 1 — ESP32 Firmware

## ไลบรารีที่ต้องติดตั้ง

### Arduino IDE (Library Manager)
1. `PZEM004Tv30` by olehs (ค้นหา: "PZEM004T")
2. `ArduinoJson` by Benoit Blanchon v7.x (ค้นหา: "ArduinoJson")

### Board Support Package
- ไปที่ File → Preferences → Additional Board URLs
- เพิ่ม: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- ไปที่ Tools → Board Manager → ค้นหา "esp32" → Install

### Board Settings ใน Arduino IDE
| Setting | Value |
|---------|-------|
| Board | ESP32 Dev Module |
| Upload Speed | 921600 |
| Flash Size | 4MB |
| Partition Scheme | Default 4MB |
| Monitor Speed | 115200 |

---

## การตั้งค่าก่อน Upload

เปิดไฟล์ `ESP32_EnergyMonitor.ino` แล้วแก้ค่าใน **ZONE 1**:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_URL       = "http://192.168.1.100:8000/api/energy-data";
const char* API_KEY       = "your_backend_api_key"; // ต้องตรงกับ Backend/.env
bool isSimulation         = true;   // เปลี่ยนเป็น false เมื่อต่อเซ็นเซอร์จริง
```

---

## ขั้นตอนการตั้ง Modbus Address PZEM-004T

```
ขั้นตอนที่ 1: ต่อ PZEM L1 เดี่ยวๆ
  ↓
ขั้นตอนที่ 2: เปิดไฟล์ SetPZEMAddress.ino → ตั้ง NEW_ADDRESS = 0x01
  ↓
ขั้นตอนที่ 3: Upload → เปิด Serial Monitor → รอข้อความ "ตั้ง Address สำเร็จ"
  ↓
ขั้นตอนที่ 4: ถอด PZEM L1 ออก
  ↓
ขั้นตอนที่ 5: ทำซ้ำสำหรับ L2 (0x02) และ L3 (0x03)
  ↓
ขั้นตอนที่ 6: ต่อ PZEM ทั้ง 3 ตัวเข้า Bus พร้อมกัน
  ↓
ขั้นตอนที่ 7: Upload ESP32_EnergyMonitor.ino
```

---

## Wiring Diagram

```
ESP32                  RS485 Module           PZEM L1, L2, L3 (Bus)
─────                  ────────────           ──────────────────────
GPIO 16 (RX2) ────────► RO                   
GPIO 17 (TX2) ────────► DI    A+ ───────────► A (ของทุกตัว, ขนาน)
GND ──────────────────► GND   B- ───────────► B (ของทุกตัว, ขนาน)
3.3V/5V ──────────────► VCC               
                         RE ──► GND (ถาวร)  
                         DE ──► GND (ถาวร)  

หมายเหตุ:
- ต่อสาย A และ B แบบ Bus (ขนาน) ไปยัง PZEM ทั้ง 3 ตัว
- ถ้าระยะสายยาวเกิน 10 เมตร ให้ต่อ Termination Resistor 120Ω ที่ปลายสาย
- PZEM ต้องการไฟ 5V สำหรับวงจร Logic (ดูที่ขา VCC ของโมดูล)
```
