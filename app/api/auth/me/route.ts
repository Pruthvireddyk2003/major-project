import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid token" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { driverId: string };
    } catch (err) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const driver = await prisma.driver.findUnique({
      where: { id: decoded.driverId },
      select: { id: true, name: true, email: true }, // select only what you need
    });

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    return NextResponse.json({ driver });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
