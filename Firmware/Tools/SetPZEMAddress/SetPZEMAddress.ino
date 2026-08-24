/**
 * ============================================================
 *  PZEM-004T v3.0 — Modbus Address Setup Utility
 * ============================================================
 *
 *  วิธีใช้:
 *  1. ต่อ PZEM-004T เพียง 1 ตัวที่ต้องการตั้ง Address
 *  2. ตั้งค่า NEW_ADDRESS ด้านล่างให้ตรงกับเฟสที่ต้องการ
 *     L1 = 0x01, L2 = 0x02, L3 = 0x03
 *  3. Upload sketch นี้ แล้วเปิด Serial Monitor @ 115200
 *  4. ถ้าสำเร็จ ถอด PZEM ออก แล้วทำซ้ำกับตัวถัดไป
 *
 *  ⚠️  ข้อควรระวัง:
 *  - ต่อ PZEM ทีละตัวเท่านั้น ห้ามต่อพร้อมกันหลายตัว
 *  - ต้องจ่ายไฟ AC ให้ PZEM ขณะตั้ง Address
 *  - Address 0x00 และ 0xF8 เป็น Broadcast — ห้ามใช้
 * ============================================================
 */

#include <PZEM004Tv30.h>

#define PZEM_RX_PIN   16    // GPIO 16 → RO ของโมดูล RS485
#define PZEM_TX_PIN   17    // GPIO 17 → DI ของโมดูล RS485
#define PZEM_BAUD     9600

// ── ✏️  ตั้งค่า Address ที่ต้องการที่นี่ ─────────────────────
// 0x01 = L1 (เฟส 1)
// 0x02 = L2 (เฟส 2)
// 0x03 = L3 (เฟส 3)
#define NEW_ADDRESS  0x01   // ← เปลี่ยนค่านี้ก่อน Upload

HardwareSerial pzemSerial(2);

// 0xF8 = General Broadcast Address (สื่อสารกับทุกตัวบน Bus)
PZEM004Tv30 pzem(&pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0xF8);

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("══════════════════════════════════════"));
  Serial.println(F("  PZEM-004T Address Setup Utility"));
  Serial.println(F("══════════════════════════════════════"));

  pzemSerial.begin(PZEM_BAUD, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
  delay(200);

  // อ่าน Address ปัจจุบันก่อน
  uint8_t currentAddr = pzem.getAddress();
  Serial.printf("[INFO] Address ปัจจุบัน (Broadcast): 0x%02X\n", currentAddr);
  Serial.printf("[INFO] กำลังตั้ง Address ใหม่เป็น: 0x%02X\n", NEW_ADDRESS);

  // ตั้ง Address ใหม่
  if (pzem.setAddress(NEW_ADDRESS)) {
    Serial.printf("[OK]  ✅ ตั้ง Address 0x%02X สำเร็จ!\n", NEW_ADDRESS);
    Serial.println(F("[OK]  ถอด PZEM ตัวนี้ออก แล้วต่อตัวถัดไป"));

    // ทดสอบอ่านค่าด้วย Address ใหม่
    PZEM004Tv30 verify(&pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, NEW_ADDRESS);
    delay(500);
    float v = verify.voltage();
    if (!isnan(v)) {
      Serial.printf("[TEST] ✅ ทดสอบอ่านแรงดัน: %.2f V\n", v);
    } else {
      Serial.println(F("[TEST] ⚠️  ตั้ง Address สำเร็จแล้ว แต่ยังอ่านค่าไม่ได้"));
      Serial.println(F("       → ตรวจสอบว่าต่อไฟ AC เข้า PZEM แล้ว"));
    }
  } else {
    Serial.println(F("[FAIL] ❌ ตั้ง Address ล้มเหลว!"));
    Serial.println(F("       → ตรวจสอบ: สายต่อ, ไฟ AC เข้า PZEM, Baud Rate"));
  }
}

void loop() {
  // ไม่มี Loop — ทำงานครั้งเดียวใน Setup
  delay(10000);
}
