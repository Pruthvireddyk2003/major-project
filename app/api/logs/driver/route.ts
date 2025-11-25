// app/api/logs/driver/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      driverId,
      drowsiness,
      emotion,
      eyeAspectRatio,
      mouthAspectRatio,
      headPose,
      blinkDetected,
      microExpression,
      speechVolume,
      ts,
    } = body;

    if (!driverId) {
      return NextResponse.json(
        { error: "driverId is required" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    const createData: Prisma.DriverLogUncheckedCreateInput = {
      driverId,
      drowsiness:
        drowsiness !== undefined && drowsiness !== null
          ? Number(drowsiness)
          : null,
      emotion: emotion ?? null,
      eyeAspectRatio:
        eyeAspectRatio !== undefined && eyeAspectRatio !== null
          ? Number(eyeAspectRatio)
          : null,
      mouthAspectRatio:
        mouthAspectRatio !== undefined && mouthAspectRatio !== null
          ? Number(mouthAspectRatio)
          : null,
      headPose: headPose ?? null,
      blinkDetected: typeof blinkDetected === "boolean" ? blinkDetected : null,
      microExpression: microExpression ?? null,
      speechVolume:
        speechVolume !== undefined && speechVolume !== null
          ? Number(speechVolume)
          : null,
      timestamp: ts ? new Date(ts) : new Date(),
    };

    const log = await prisma.driverLog.create({
      data: createData,
    });

    return NextResponse.json({ success: true, log }, { status: 201 });
  } catch (err: any) {
    console.error("Driver log error:", err?.stack ?? err);
    return NextResponse.json(
      { error: "Internal Server Error", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const driverId = url.searchParams.get("driverId");

    if (!driverId) {
      return NextResponse.json(
        { error: "driverId is required" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    // 🔹 Fetch ALL logs for this driver, sorted oldest → newest (better for graphs)
    const logs = await prisma.driverLog.findMany({
      where: { driverId },
      orderBy: { timestamp: "asc" },
      // removed `take: 200`
    });

    const speechVolumeLogs = logs.filter((l) => l.speechVolume != null);
    const avgSpeechVolume =
      speechVolumeLogs.reduce((sum, l) => sum + (l.speechVolume || 0), 0) /
      (speechVolumeLogs.length || 1);

    return NextResponse.json({
      success: true,
      logs,
      stats: {
        avgSpeechVolume: Number(avgSpeechVolume.toFixed(2)),
      },
    });
  } catch (err: any) {
    console.error("Failed to fetch driver logs:", err?.stack ?? err);
    return NextResponse.json(
      {
        error: "Failed to fetch driver logs",
        detail: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}
