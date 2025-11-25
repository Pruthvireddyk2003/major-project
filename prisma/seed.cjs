// prisma/seed.cjs
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

// MAIN CONFIG
const TOTAL_LOGS_NEW_USER = 10000; // when user does NOT exist
const TOTAL_LOGS_EXISTING = 1000; // when user already exists
const BATCH = 500;

const EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "disgusted",
  "fearful",
  "calm",
];

// ---- BETTER RANDOM HELPERS ----

// cryptographically stronger random float
function rand(min = 0, max = 1) {
  const buf = crypto.randomBytes(4);
  const uint = buf.readUInt32BE(0);
  const r = uint / 0xffffffff; // 0–1
  return r * (max - min) + min;
}

function randInt(min, max) {
  // inclusive
  return Math.floor(rand(min, max + 1));
}

function choose(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function randomTimestampBetween(start, end) {
  const s = start.getTime();
  const e = end.getTime();
  const ts = rand(s, e);
  return new Date(ts);
}

// optional: skew to realistic drowsiness (mostly low, some spikes)
function randomDrowsiness() {
  const r = rand(0, 1);
  if (r < 0.7) {
    // 70% of time low drowsiness
    return Number(rand(0.0, 0.3).toFixed(3));
  } else if (r < 0.9) {
    // 20% medium
    return Number(rand(0.3, 0.7).toFixed(3));
  } else {
    // 10% high
    return Number(rand(0.7, 1.0).toFixed(3));
  }
}

// bias emotions a bit so it's not uniform
function randomEmotion() {
  const weighted = [
    "neutral",
    "neutral",
    "neutral",
    "neutral",
    "calm",
    "calm",
    "happy",
    "happy",
    "sad",
    "angry",
    "surprised",
    "disgusted",
    "fearful",
  ];
  return choose(weighted);
}

// ---- LOG GENERATOR ----

function generateLogs(driverId, count, start, end) {
  const logs = [];
  const startMs = start.getTime();
  const endMs = end.getTime();
  const totalSpan = endMs - startMs;

  for (let i = 0; i < count; i++) {
    // spread timestamps roughly across the window + jitter
    const baseTs = startMs + (totalSpan * i) / count;
    const jitter = rand(-totalSpan / (count * 4), totalSpan / (count * 4));
    const ts = new Date(baseTs + jitter);

    const pitch = rand(-20, 20);
    const yaw = rand(-30, 30);
    const roll = rand(-15, 15);

    logs.push({
      driverId,
      drowsiness: randomDrowsiness(),
      emotion: randomEmotion(),
      eyeAspectRatio: Number(rand(0.15, 0.35).toFixed(3)),
      mouthAspectRatio: Number(rand(0.1, 0.6).toFixed(3)),
      headPose: `pitch:${pitch.toFixed(2)},yaw:${yaw.toFixed(
        2
      )},roll:${roll.toFixed(2)}`,
      blinkDetected: rand(0, 1) < 0.12,
      microExpression: null,
      speechVolume: Number(rand(0.1, 1.0).toFixed(3)),
      timestamp: ts,
    });
  }

  return logs;
}

// ---- MAIN ----

async function main() {
  console.log("\n🚀 Starting seed script...\n");

  const email = "driver1@example.com";
  const password =
    "$2a$12$8hUTs2I8NNRft1aseMpC8e09FaOwqahlHB.5vSQY27L1Nj8oVB25e";
  const name = "Driver 1";

  const now = new Date();
  const start = new Date();
  // last 1 month
  start.setMonth(start.getMonth() - 1);

  // Check if driver exists
  let driver = await prisma.driver.findUnique({ where: { email } });

  if (!driver) {
    // Create new driver
    console.log(`🆕 Creating new driver: ${email}`);
    driver = await prisma.driver.create({
      data: { name, email, password, role: "driver" },
    });

    console.log(`✔ User created: ${email}`);
    console.log(`📌 Seeding ${TOTAL_LOGS_NEW_USER} logs...\n`);

    const logs = generateLogs(driver.id, TOTAL_LOGS_NEW_USER, start, now);

    // Batch insert
    for (let i = 0; i < logs.length; i += BATCH) {
      const slice = logs.slice(i, i + BATCH);
      await prisma.driverLog.createMany({ data: slice });
      process.stdout.write(
        `Inserted ${Math.min(i + BATCH, logs.length)} / ${logs.length}\r`
      );
    }

    console.log("\n\n🎉 Seed complete for NEW user!\n");
  } else {
    console.log(`👤 User already exists: ${email}`);
    console.log(`📌 Adding ${TOTAL_LOGS_EXISTING} NEW logs...\n`);

    const logs = generateLogs(driver.id, TOTAL_LOGS_EXISTING, start, now);

    for (let i = 0; i < logs.length; i += BATCH) {
      const slice = logs.slice(i, i + BATCH);
      await prisma.driverLog.createMany({ data: slice });
      process.stdout.write(
        `Inserted ${Math.min(i + BATCH, logs.length)} / ${
          logs.length
        } (existing)\r`
      );
    }

    console.log(`\n✔ Added ${TOTAL_LOGS_EXISTING} logs for existing user\n`);
  }

  console.log(`👉 Username: ${email}`);
  console.log(`👉 Password hash: ${password} (original password: password1)\n`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
