// app/api/auth/login/route.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export async function POST(req: Request) {
  try {
    const { email, password }: { email?: string; password?: string } =
      await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.findUnique({ where: { email } });
    if (!driver)
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );

    const isValid = await bcrypt.compare(password, driver.password);
    if (!isValid)
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );

    const token = jwt.sign({ driverId: driver.id }, JWT_SECRET, {
      expiresIn: "8h",
    });

    return NextResponse.json({
      token,
      driver: { id: driver.id, name: driver.name, email: driver.email },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
