// ESP32 + WS2812B DIY Smart Lamp
// Wi-Fi controlled desk lamp: power, brightness, color, and light effects
// served from a small web page hosted on the ESP32 itself.

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <FastLED.h>

// ---------------- USER CONFIG ----------------
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char *MDNS_NAME = "smartlamp"; // reachable at http://smartlamp.local

#define DATA_PIN 4     // WS2812B DIN, through a ~330ohm resistor
#define NUM_LEDS 60    // 1m strip at 60 LED/m
#define LED_TYPE WS2812B
#define COLOR_ORDER GRB
#define MAX_MILLIAMPS 1500 // match your 5V adapter's rated current (mA)
// ----------------------------------------------

CRGB leds[NUM_LEDS];
WebServer server(80);
Preferences prefs;

enum Effect { EFFECT_SOLID = 0, EFFECT_WARM = 1, EFFECT_RAINBOW = 2, EFFECT_BREATHE = 3 };

struct LampState {
  bool power = true;
  uint8_t brightness = 150;
  uint8_t r = 255, g = 200, b = 120;
  Effect effect = EFFECT_SOLID;
} state;

unsigned long lastAnim = 0;
uint8_t animPhase = 0;

void saveState() {
  prefs.putBool("power", state.power);
  prefs.putUChar("bri", state.brightness);
  prefs.putUChar("r", state.r);
  prefs.putUChar("g", state.g);
  prefs.putUChar("b", state.b);
  prefs.putUChar("fx", state.effect);
}

void loadState() {
  state.power = prefs.getBool("power", true);
  state.brightness = prefs.getUChar("bri", 150);
  state.r = prefs.getUChar("r", 255);
  state.g = prefs.getUChar("g", 200);
  state.b = prefs.getUChar("b", 120);
  state.effect = (Effect)prefs.getUChar("fx", EFFECT_SOLID);
}

String stateJson() {
  String json = "{";
  json += "\"power\":" + String(state.power ? "true" : "false") + ",";
  json += "\"brightness\":" + String(state.brightness) + ",";
  json += "\"r\":" + String(state.r) + ",";
  json += "\"g\":" + String(state.g) + ",";
  json += "\"b\":" + String(state.b) + ",";
  json += "\"effect\":" + String((int)state.effect);
  json += "}";
  return json;
}

const char INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIY Smart Lamp</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; min-height: 100vh;
    background: #14161c; color: #f2f2f2;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; justify-content: center;
  }
  .card {
    width: 100%; max-width: 420px;
    background: #1e212b; border-radius: 20px; padding: 24px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  }
  h1 { font-size: 20px; margin: 0 0 20px; display: flex; align-items: center; gap: 8px; }
  .row { margin-bottom: 20px; }
  label { display: block; font-size: 13px; color: #9aa0ac; margin-bottom: 8px; }
  input[type=range] { width: 100%; }
  input[type=color] { width: 100%; height: 44px; border: none; border-radius: 10px; background: none; }
  .power-btn {
    width: 100%; padding: 14px; border-radius: 12px; border: none;
    font-size: 16px; font-weight: 600; cursor: pointer;
    background: #4c8bf5; color: white; transition: background .2s;
  }
  .power-btn.off { background: #33384a; color: #9aa0ac; }
  .effects { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .fx-btn {
    padding: 12px; border-radius: 10px; border: 1px solid #33384a;
    background: #262a36; color: #f2f2f2; cursor: pointer; font-size: 14px;
  }
  .fx-btn.active { border-color: #4c8bf5; background: #2b3550; }
</style>
</head>
<body>
  <div class="card">
    <h1>DIY Smart Lamp</h1>
    <div class="row">
      <button id="powerBtn" class="power-btn">전원</button>
    </div>
    <div class="row">
      <label>밝기 <span id="briVal"></span></label>
      <input type="range" id="brightness" min="5" max="255">
    </div>
    <div class="row">
      <label>색상</label>
      <input type="color" id="color">
    </div>
    <div class="row">
      <label>모드</label>
      <div class="effects">
        <button class="fx-btn" data-fx="0">단색</button>
        <button class="fx-btn" data-fx="1">따뜻한 백색</button>
        <button class="fx-btn" data-fx="2">레인보우</button>
        <button class="fx-btn" data-fx="3">호흡 효과</button>
      </div>
    </div>
  </div>

<script>
const powerBtn = document.getElementById('powerBtn');
const brightness = document.getElementById('brightness');
const briVal = document.getElementById('briVal');
const color = document.getElementById('color');
const fxBtns = document.querySelectorAll('.fx-btn');

let current = {};

function toHex(r,g,b){
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function render(s){
  current = s;
  powerBtn.textContent = s.power ? '켜짐' : '꺼짐';
  powerBtn.classList.toggle('off', !s.power);
  brightness.value = s.brightness;
  briVal.textContent = s.brightness;
  color.value = toHex(s.r, s.g, s.b);
  fxBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.fx) === s.effect));
}

function refresh(){
  fetch('/api/state').then(r => r.json()).then(render);
}

function post(params){
  const body = new URLSearchParams(params);
  fetch('/api/set', { method: 'POST', body }).then(r => r.json()).then(render);
}

powerBtn.addEventListener('click', () => post({ power: current.power ? '0' : '1' }));

let briTimeout;
brightness.addEventListener('input', () => {
  briVal.textContent = brightness.value;
  clearTimeout(briTimeout);
  briTimeout = setTimeout(() => post({ brightness: brightness.value }), 80);
});

color.addEventListener('input', () => {
  const hex = color.value;
  post({
    r: parseInt(hex.substr(1,2), 16),
    g: parseInt(hex.substr(3,2), 16),
    b: parseInt(hex.substr(5,2), 16)
  });
});

fxBtns.forEach(btn => btn.addEventListener('click', () => post({ effect: btn.dataset.fx })));

refresh();
</script>
</body>
</html>
)HTML";

void handleRoot() { server.send_P(200, "text/html", INDEX_HTML); }
void handleState() { server.send(200, "application/json", stateJson()); }

void handleSet() {
  if (server.hasArg("power")) state.power = server.arg("power") == "1";
  if (server.hasArg("brightness")) state.brightness = constrain(server.arg("brightness").toInt(), 0, 255);
  if (server.hasArg("r")) state.r = constrain(server.arg("r").toInt(), 0, 255);
  if (server.hasArg("g")) state.g = constrain(server.arg("g").toInt(), 0, 255);
  if (server.hasArg("b")) state.b = constrain(server.arg("b").toInt(), 0, 255);
  if (server.hasArg("effect")) state.effect = (Effect)constrain(server.arg("effect").toInt(), 0, 3);
  saveState();
  server.send(200, "application/json", stateJson());
}

void applyEffect() {
  if (!state.power) {
    fill_solid(leds, NUM_LEDS, CRGB::Black);
    FastLED.show();
    return;
  }

  FastLED.setBrightness(state.brightness);

  switch (state.effect) {
    case EFFECT_SOLID:
      fill_solid(leds, NUM_LEDS, CRGB(state.r, state.g, state.b));
      break;

    case EFFECT_WARM:
      fill_solid(leds, NUM_LEDS, CRGB(255, 165, 60));
      break;

    case EFFECT_RAINBOW:
      if (millis() - lastAnim > 20) {
        fill_rainbow(leds, NUM_LEDS, animPhase, 255 / NUM_LEDS);
        animPhase++;
        lastAnim = millis();
      }
      break;

    case EFFECT_BREATHE: {
      uint8_t wave = beatsin8(6, 40, 255);
      CRGB c(state.r, state.g, state.b);
      c.nscale8_video(wave);
      fill_solid(leds, NUM_LEDS, c);
      break;
    }
  }

  FastLED.show();
}

void setup() {
  Serial.begin(115200);

  prefs.begin("lamp", false);
  loadState();

  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MILLIAMPS);
  FastLED.setBrightness(state.brightness);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin(MDNS_NAME)) {
    Serial.printf("mDNS ready: http://%s.local\n", MDNS_NAME);
  }

  server.on("/", handleRoot);
  server.on("/api/state", HTTP_GET, handleState);
  server.on("/api/set", HTTP_POST, handleSet);
  server.begin();
}

void loop() {
  server.handleClient();
  applyEffect();
}
