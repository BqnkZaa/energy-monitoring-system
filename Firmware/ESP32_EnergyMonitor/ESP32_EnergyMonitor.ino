/**
 * ============================================================
 *  Real-Time Energy Monitoring System — ESP32 Firmware
 *  Phase 1: PZEM-004T v3.0 × 3 ผ่าน Modbus RTU (HW Serial2)
 * ============================================================
 *
 *  ผู้เขียน : AI Agent (IoT / Full-Stack Engineer)
 *  วันที่    : 2026-07-07
 *  บอร์ด    : ESP32 (ทุกรุ่น เช่น ESP32 DevKit v1, WROOM-32)
 *  IDE      : Arduino IDE 2.x หรือ PlatformIO
 *
 * ─────────────────────────────────────────────────────────────
 *  LIBRARY ที่ต้องติดตั้ง (Arduino Library Manager):
 *    1. PZEM004Tv30  by olehs  — https://github.com/olehs/PZEM004T
 *    2. ArduinoJson  by Benoit Blanchon  — version 7.x
 * ─────────────────────────────────────────────────────────────
 *
 *  PINOUT — การเชื่อมต่อ PZEM-004T กับ ESP32
 * ┌─────────────────────────────────────────────────────┐
 * │  ESP32          TTL-RS485 Module    PZEM-004T Bus   │
 * │  GPIO 16 (RX2) ──► RO  │            A ──► A        │
 * │  GPIO 17 (TX2) ──► DI  │ Module     B ──► B        │
 * │  (ไม่ใช้ RE/DE)  RE+DE ──► GND       │              │
 * │  GND            GND    │            GND            │
 * │  3.3V / 5V      VCC    │            5V             │
 * └─────────────────────────────────────────────────────┘
 *
 *  หมายเหตุ: ต่อ RE และ DE ของโมดูล RS485 เข้า GND ถาวร
 *  (Half-Duplex Receive-Only Mode) เพราะ PZEM ตอบกลับเสมอ
 *  หากโมดูลมีแค่ 4 ขา (VCC/GND/RX/TX) ให้ต่อตรงได้เลย
 *
 * ─────────────────────────────────────────────────────────────
 *  การเปลี่ยน Modbus Address ของ PZEM-004T:
 *
 *  วิธีที่ 1 — ใช้สเก็ตช์ตั้ง Address (แนะนำ):
 *    ต่อ PZEM แต่ละตัวเดี่ยวๆ แล้วรันโค้ดในไฟล์
 *    Firmware/Tools/SetPZEMAddress/SetPZEMAddress.ino
 *    โดยกำหนดค่า NEW_ADDRESS ในไฟล์นั้น
 *
 *  วิธีที่ 2 — ผ่าน PZEM004Tv30 Library:
 *    PZEM004Tv30 pzem(&Serial2, RX_PIN, TX_PIN, 0xF8); // 0xF8 = broadcast
 *    pzem.setAddress(0x01); // เปลี่ยนเป็น address ที่ต้องการ
 *
 *  ลำดับการตั้ง Address ที่แนะนำ:
 *    ① ต่อ PZEM L1 เดี่ยว → ตั้ง Address 0x01 → ถอด
 *    ② ต่อ PZEM L2 เดี่ยว → ตั้ง Address 0x02 → ถอด
 *    ③ ต่อ PZEM L3 เดี่ยว → ตั้ง Address 0x03 → ถอด
 *    ④ ต่อทั้งสามตัวเข้า Bus พร้อมกัน → รันโค้ดหลัก
 * ─────────────────────────────────────────────────────────────
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>

// ═══════════════════════════════════════════════════════════════
//  ⚙️  ZONE 1: การตั้งค่าหลัก — แก้ไขค่าในส่วนนี้เท่านั้น
// ═══════════════════════════════════════════════════════════════

// ── WiFi ──────────────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";      // ชื่อ Wi-Fi
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";  // รหัสผ่าน Wi-Fi

// ── API Server (Raspberry Pi) ──────────────────────────────────
// เปลี่ยนเป็น IP Address ของ Raspberry Pi ในเครือข่ายเดียวกัน
const char* API_URL = "http://192.168.1.100:8000/api/energy-data";

// ต้องตรงกับค่า API_KEY ใน Backend/.env
const char* API_KEY = "energy_monitor_secret_key_change_me";

// ── Device Identity ───────────────────────────────────────────
const char* DEVICE_ID = "ESP32_MDB_01";

// ── Simulation Mode ───────────────────────────────────────────
// true  = ใช้ข้อมูลจำลอง (ทดสอบระบบ Software โดยไม่ต้องต่อเซ็นเซอร์จริง)
// false = อ่านข้อมูลจากเซ็นเซอร์ PZEM-004T จริง
bool isSimulation = true;

// ── Timing ────────────────────────────────────────────────────
const unsigned long READ_INTERVAL_MS  = 2000;   // อ่านค่าทุก 2 วินาที
const unsigned long WIFI_TIMEOUT_MS   = 10000;  // รอ WiFi ไม่เกิน 10 วินาที
const unsigned long HTTP_TIMEOUT_MS   = 5000;   // HTTP request timeout 5 วินาที

// ═══════════════════════════════════════════════════════════════
//  ⚙️  ZONE 2: การตั้งค่า Hardware — UART & PZEM Addresses
// ═══════════════════════════════════════════════════════════════

// ── Hardware Serial 2 Pins ────────────────────────────────────
#define PZEM_RX_PIN  16  // GPIO 16 → ต่อกับ RO ของโมดูล RS485
#define PZEM_TX_PIN  17  // GPIO 17 → ต่อกับ DI ของโมดูล RS485
#define PZEM_BAUD    9600

// ── Modbus Slave Addresses ────────────────────────────────────
// ต้องตั้งค่า Address ในตัว PZEM ให้ตรงกับที่กำหนดไว้ที่นี่
#define PZEM_ADDR_L1  0x01  // เฟส L1 (Phase 1)
#define PZEM_ADDR_L2  0x02  // เฟส L2 (Phase 2)
#define PZEM_ADDR_L3  0x03  // เฟส L3 (Phase 3)

// ═══════════════════════════════════════════════════════════════
//  📦  โครงสร้างข้อมูลพลังงานต่อเฟส
// ═══════════════════════════════════════════════════════════════
struct PhaseData {
  float voltage;    // แรงดันไฟฟ้า (V)
  float current;    // กระแสไฟฟ้า (A)
  float power;      // กำลังไฟฟ้า (W)
  float energy;     // พลังงานสะสม (kWh)
  float frequency;  // ความถี่ (Hz)
  float pf;         // Power Factor (0.0 – 1.0)
  bool  valid;      // true = อ่านสำเร็จ, false = อ่านล้มเหลว
};

// ═══════════════════════════════════════════════════════════════
//  🔧  Global Objects
// ═══════════════════════════════════════════════════════════════

// สร้าง Serial2 สำหรับ PZEM Bus ทั้งสามตัวใช้ร่วมกัน
// (HardwareSerial ตัวเดียว, แยก Slave ด้วย Modbus Address)
HardwareSerial pzemSerial(2);  // UART2 ของ ESP32

// สร้าง Object PZEM สามตัว แต่ละตัวชี้ไปที่ Serial เดียวกัน
// และใช้ Address ต่างกันในการ Poll Modbus
PZEM004Tv30 pzem_L1(&pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, PZEM_ADDR_L1);
PZEM004Tv30 pzem_L2(&pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, PZEM_ADDR_L2);
PZEM004Tv30 pzem_L3(&pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, PZEM_ADDR_L3);

// ตัวแปรควบคุมเวลา (Non-Blocking)
unsigned long lastReadTime = 0;
unsigned long lastWifiCheckTime = 0;

// ═══════════════════════════════════════════════════════════════
//  🔧  Function Prototypes
// ═══════════════════════════════════════════════════════════════
void     setupWiFi();
void     checkAndReconnectWiFi();
PhaseData readPhaseSensor(PZEM004Tv30& sensor, const char* phaseName);
PhaseData generateSimulatedData(int phaseIndex);
String   buildJsonPayload(PhaseData& L1, PhaseData& L2, PhaseData& L3);
void     sendHttpPost(const String& jsonPayload);
void     printPhaseData(const char* name, const PhaseData& data);

// ═══════════════════════════════════════════════════════════════
//  🚀  SETUP
// ═══════════════════════════════════════════════════════════════
void setup() {
  // เริ่มต้น Serial Monitor สำหรับ Debug
  Serial.begin(115200);
  delay(500);

  Serial.println(F("╔════════════════════════════════════════╗"));
  Serial.println(F("║   Energy Monitor — ESP32 Firmware      ║"));
  Serial.println(F("║   3-Phase PZEM-004T v3.0 via Modbus    ║"));
  Serial.println(F("╚════════════════════════════════════════╝"));

  // แสดงโหมดการทำงาน
  if (isSimulation) {
    Serial.println(F("[MODE] *** SIMULATION MODE — ไม่อ่านเซ็นเซอร์จริง ***"));
  } else {
    Serial.println(F("[MODE] REAL SENSOR MODE — อ่านค่าจาก PZEM-004T จริง"));
    Serial.printf("[UART] เริ่มต้น HW Serial2: RX=GPIO%d, TX=GPIO%d, Baud=%d\n",
                  PZEM_RX_PIN, PZEM_TX_PIN, PZEM_BAUD);
  }

  // เริ่มต้น Serial2 สำหรับ PZEM (ถ้าไม่ใช่ Simulation)
  // หมายเหตุ: Library PZEM004Tv30 จะ begin() Serial ให้อัตโนมัติ
  // แต่เราเรียกเองเพื่อให้แน่ใจว่า GPIO ถูกต้อง
  if (!isSimulation) {
    pzemSerial.begin(PZEM_BAUD, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
    Serial.println(F("[UART] Serial2 เริ่มต้นสำเร็จ"));
    delay(100);
  }

  // เชื่อมต่อ WiFi
  setupWiFi();

  // เตรียม Random Seed สำหรับ Simulation Mode
  randomSeed(analogRead(34));  // GPIO 34 เป็นขา ADC ที่ไม่ได้ต่ออะไร (Floating)

  Serial.println(F("[SYS] ระบบพร้อมทำงาน — เริ่ม Loop หลัก"));
  Serial.println(F("──────────────────────────────────────────"));
}

// ═══════════════════════════════════════════════════════════════
//  🔁  MAIN LOOP
// ═══════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── ตรวจสอบ WiFi ทุก 5 วินาที (Non-Blocking) ─────────────
  if (now - lastWifiCheckTime >= 5000) {
    lastWifiCheckTime = now;
    checkAndReconnectWiFi();
  }

  // ── อ่านและส่งข้อมูลตาม Interval ─────────────────────────
  if (now - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = now;

    Serial.println(F("\n─── รอบการอ่านใหม่ ─────────────────────"));

    PhaseData dataL1, dataL2, dataL3;

    if (isSimulation) {
      // ── โหมดจำลอง: สุ่มข้อมูลที่ใกล้เคียงความจริง ────────
      dataL1 = generateSimulatedData(1);
      dataL2 = generateSimulatedData(2);
      dataL3 = generateSimulatedData(3);
      Serial.println(F("[SIM] สร้างข้อมูลจำลองสำเร็จ"));
    } else {
      // ── โหมดจริง: อ่านจาก PZEM-004T ทีละเฟส ──────────────
      dataL1 = readPhaseSensor(pzem_L1, "L1");
      dataL2 = readPhaseSensor(pzem_L2, "L2");
      dataL3 = readPhaseSensor(pzem_L3, "L3");
    }

    // แสดงผลใน Serial Monitor
    printPhaseData("L1", dataL1);
    printPhaseData("L2", dataL2);
    printPhaseData("L3", dataL3);

    // สร้าง JSON Payload
    String jsonPayload = buildJsonPayload(dataL1, dataL2, dataL3);
    Serial.print(F("[JSON] Payload: "));
    Serial.println(jsonPayload);

    // ส่งข้อมูลไปยัง API Server (เฉพาะเมื่อ WiFi เชื่อมต่ออยู่)
    if (WiFi.status() == WL_CONNECTED) {
      sendHttpPost(jsonPayload);
    } else {
      Serial.println(F("[WiFi] ⚠️  ไม่มีการเชื่อมต่อ — ข้ามการส่งข้อมูลรอบนี้"));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  📡  WiFi Management Functions
// ═══════════════════════════════════════════════════════════════

/**
 * เชื่อมต่อ WiFi ตอน Startup พร้อม Timeout
 */
void setupWiFi() {
  Serial.printf("[WiFi] กำลังเชื่อมต่อ SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);   // ให้ ESP32 reconnect อัตโนมัติ
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startTime > WIFI_TIMEOUT_MS) {
      Serial.println(F("\n[WiFi] ❌ Timeout — ดำเนินการต่อโดยไม่มี WiFi"));
      return;
    }
    Serial.print(F("."));
    delay(500);
  }

  Serial.println();
  Serial.printf("[WiFi] ✅ เชื่อมต่อสำเร็จ! IP: %s\n",
                WiFi.localIP().toString().c_str());
  Serial.printf("[WiFi] Signal RSSI: %d dBm\n", WiFi.RSSI());
}

/**
 * ตรวจสอบและ Reconnect WiFi หากหลุด (เรียกใน Loop)
 */
void checkAndReconnectWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[WiFi] ⚠️  WiFi หลุด — กำลัง Reconnect..."));
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    // ไม่ Blocking — รอรอบถัดไปเช็คอีกครั้ง
  }
}

// ═══════════════════════════════════════════════════════════════
//  📊  Sensor Reading Functions
// ═══════════════════════════════════════════════════════════════

/**
 * อ่านค่าจาก PZEM-004T ตัวเดียว
 * @param sensor    Object PZEM ที่ต้องการอ่าน
 * @param phaseName ชื่อเฟส ("L1", "L2", "L3") สำหรับ Log
 * @return PhaseData struct พร้อมค่าที่อ่านได้ (valid=false หากล้มเหลว)
 */
PhaseData readPhaseSensor(PZEM004Tv30& sensor, const char* phaseName) {
  PhaseData data;
  data.valid = false;

  // อ่านแรงดัน — ถ้าได้ NaN = เซ็นเซอร์ไม่ตอบสนอง
  float v = sensor.voltage();

  if (isnan(v)) {
    Serial.printf("[ERROR] ❌ เฟส %s: ไม่สามารถอ่านค่าได้ (Addr=0x%02X)"
                  " — ตรวจสอบสายและ Modbus Address\n",
                  phaseName, sensor.getAddress());
    // ส่งคืน data ที่ valid=false และค่าทั้งหมดเป็น 0
    data.voltage   = 0.0f;
    data.current   = 0.0f;
    data.power     = 0.0f;
    data.energy    = 0.0f;
    data.frequency = 0.0f;
    data.pf        = 0.0f;
    return data;
  }

  // อ่านค่าที่เหลือ
  data.voltage   = v;
  data.current   = sensor.current();
  data.power     = sensor.power();
  data.energy    = sensor.energy();    // หน่วย kWh
  data.frequency = sensor.frequency();
  data.pf        = sensor.pf();
  data.valid     = true;

  // ตรวจสอบว่าค่าที่อ่านได้สมเหตุสมผล
  if (isnan(data.current))   data.current   = 0.0f;
  if (isnan(data.power))     data.power     = 0.0f;
  if (isnan(data.energy))    data.energy    = 0.0f;
  if (isnan(data.frequency)) data.frequency = 0.0f;
  if (isnan(data.pf))        data.pf        = 0.0f;

  return data;
}

// ═══════════════════════════════════════════════════════════════
//  🎲  Simulation Data Generator
// ═══════════════════════════════════════════════════════════════

/**
 * สร้างข้อมูลจำลองที่ใกล้เคียงไฟฟ้า 3 เฟสจริง
 * ค่าจะสุ่มในช่วงที่สมเหตุสมผลสำหรับระบบไฟฟ้า 220V 50Hz
 * @param phaseIndex เลขเฟส (1, 2, 3) เพื่อให้ค่า Base ต่างกันเล็กน้อย
 */
PhaseData generateSimulatedData(int phaseIndex) {
  PhaseData data;

  // ── ค่า Base ต่างกันเล็กน้อยระหว่างเฟส (จำลองความไม่สมดุล) ──
  float voltageBase  = 219.0f + (phaseIndex * 0.5f);   // 219.5 / 220.0 / 220.5
  float currentBase  = 4.5f  + (phaseIndex * 0.3f);    // 4.8 / 5.1 / 5.4
  float energyBase   = 10.0f + (phaseIndex * 1.5f);    // 11.5 / 13.0 / 14.5
  float pfBase       = 0.92f + (phaseIndex * 0.01f);   // 0.93 / 0.94 / 0.95

  // ── สุ่มค่าในช่วง ±variance ──────────────────────────────────
  // random() ของ Arduino คืนค่า long; แปลงเป็น float ด้วยการหาร
  float voltageVariance  = (random(-30, 30)) / 10.0f;    // ±3.0 V
  float currentVariance  = (random(-20, 20)) / 100.0f;   // ±0.20 A
  float frequencyVariance= (random(-5,  5))  / 100.0f;   // ±0.05 Hz
  float pfVariance       = (random(-2,  2))  / 100.0f;   // ±0.02

  data.voltage   = voltageBase + voltageVariance;
  data.current   = currentBase + currentVariance;
  data.frequency = 50.0f + frequencyVariance;
  data.pf        = pfBase + pfVariance;

  // คำนวณ Power จาก V × I × PF (Active Power)
  data.power     = data.voltage * data.current * data.pf;

  // Energy สะสม — เพิ่มขึ้นทีละนิดในแต่ละรอบ (จำลองมิเตอร์นับ)
  // ใช้ตัวแปร static เพื่อให้ค่าสะสมข้ามรอบ
  static float accEnergy[3] = {11.5f, 13.0f, 14.5f};
  accEnergy[phaseIndex - 1] += data.power / 3600000.0f; // W → kWh per 2s
  data.energy = energyBase + accEnergy[phaseIndex - 1];

  data.valid = true;
  return data;
}

// ═══════════════════════════════════════════════════════════════
//  📝  JSON Builder
// ═══════════════════════════════════════════════════════════════

/**
 * สร้าง JSON String จากข้อมูล 3 เฟส
 * รูปแบบ JSON ตรงตามที่ API Server กำหนด
 */
String buildJsonPayload(PhaseData& L1, PhaseData& L2, PhaseData& L3) {
  // คำนวณค่ารวม
  float totalW   = L1.power  + L2.power  + L3.power;
  float totalKwh = L1.energy + L2.energy + L3.energy;

  // ใช้ ArduinoJson Document (capacity สำหรับ JSON ขนาดนี้ประมาณ 512 bytes)
  JsonDocument doc;

  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = millis();  // ใช้ millis() เป็น timestamp สัมพัทธ์
                                 // (หรือเปลี่ยนเป็น NTP time หากต้องการ absolute time)

  // ── เฟส L1 ──────────────────────────────────────────────────
  JsonObject phases    = doc["phases"].to<JsonObject>();
  JsonObject phaseL1   = phases["L1"].to<JsonObject>();
  phaseL1["v"]         = serialized(String(L1.voltage,   2));
  phaseL1["a"]         = serialized(String(L1.current,   3));
  phaseL1["w"]         = serialized(String(L1.power,     2));
  phaseL1["kwh"]       = serialized(String(L1.energy,    3));
  phaseL1["hz"]        = serialized(String(L1.frequency, 1));
  phaseL1["pf"]        = serialized(String(L1.pf,        2));
  phaseL1["valid"]     = L1.valid;

  // ── เฟส L2 ──────────────────────────────────────────────────
  JsonObject phaseL2   = phases["L2"].to<JsonObject>();
  phaseL2["v"]         = serialized(String(L2.voltage,   2));
  phaseL2["a"]         = serialized(String(L2.current,   3));
  phaseL2["w"]         = serialized(String(L2.power,     2));
  phaseL2["kwh"]       = serialized(String(L2.energy,    3));
  phaseL2["hz"]        = serialized(String(L2.frequency, 1));
  phaseL2["pf"]        = serialized(String(L2.pf,        2));
  phaseL2["valid"]     = L2.valid;

  // ── เฟส L3 ──────────────────────────────────────────────────
  JsonObject phaseL3   = phases["L3"].to<JsonObject>();
  phaseL3["v"]         = serialized(String(L3.voltage,   2));
  phaseL3["a"]         = serialized(String(L3.current,   3));
  phaseL3["w"]         = serialized(String(L3.power,     2));
  phaseL3["kwh"]       = serialized(String(L3.energy,    3));
  phaseL3["hz"]        = serialized(String(L3.frequency, 1));
  phaseL3["pf"]        = serialized(String(L3.pf,        2));
  phaseL3["valid"]     = L3.valid;

  // ── ค่ารวมทั้งระบบ ───────────────────────────────────────────
  JsonObject total     = doc["total"].to<JsonObject>();
  total["w"]           = serialized(String(totalW,   2));
  total["kwh"]         = serialized(String(totalKwh, 3));

  String output;
  serializeJson(doc, output);
  return output;
}

// ═══════════════════════════════════════════════════════════════
//  📤  HTTP POST Function
// ═══════════════════════════════════════════════════════════════

/**
 * ส่ง JSON ไปยัง API Server ด้วย HTTP POST
 * @param jsonPayload ข้อมูล JSON ที่จะส่ง
 */
void sendHttpPost(const String& jsonPayload) {
  HTTPClient http;

  Serial.printf("[HTTP] กำลังส่งไปที่: %s\n", API_URL);

  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key",    API_KEY);
  http.addHeader("X-Device-ID",  DEVICE_ID);   // Header เพิ่มเติมสำหรับ Auth
  http.setTimeout(HTTP_TIMEOUT_MS);

  int httpCode = http.POST(jsonPayload);

  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      String response = http.getString();
      Serial.printf("[HTTP] ✅ ส่งสำเร็จ! Code: %d | Response: %s\n",
                    httpCode, response.c_str());
    } else {
      Serial.printf("[HTTP] ⚠️  Server ตอบกลับ Code: %d\n", httpCode);
    }
  } else {
    // httpCode < 0 = Connection Error
    Serial.printf("[HTTP] ❌ Connection Error: %s\n",
                  http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ═══════════════════════════════════════════════════════════════
//  🖨️  Debug Print Functions
// ═══════════════════════════════════════════════════════════════

/**
 * แสดงค่าพลังงานของแต่ละเฟสใน Serial Monitor แบบอ่านง่าย
 */
void printPhaseData(const char* name, const PhaseData& data) {
  if (!data.valid) {
    Serial.printf("  [%s] ❌ ข้อมูลไม่ถูกต้อง (อ่านไม่ได้)\n", name);
    return;
  }
  Serial.printf("  [%s] V=%6.2fV | A=%5.3fA | W=%7.2fW | "
                "kWh=%7.3f | Hz=%5.1f | PF=%4.2f\n",
                name,
                data.voltage,
                data.current,
                data.power,
                data.energy,
                data.frequency,
                data.pf);
}
