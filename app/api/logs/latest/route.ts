// app/api/logs/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // make sure prisma client is correctly imported

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const driverId = url.searchParams.get("driverId");

  if (!driverId) {
    return NextResponse.json({ error: "Missing driverId" }, { status: 400 });
  }

  try {
    const latestLog = await prisma.driverLog.findFirst({
      where: { driverId },
      orderBy: { timestamp: "desc" },
    });

    if (!latestLog) {
      return NextResponse.json({ error: "No logs found" }, { status: 404 });
    }

    return NextResponse.json(latestLog);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
