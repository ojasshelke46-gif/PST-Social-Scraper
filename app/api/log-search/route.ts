import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface LogSearchBody {
  name: string;
  email: string;
  keyword: string;
  timestamp: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LogSearchBody;
    const { name, email, keyword, timestamp } = body;

    await adminDb.collection("search_logs").add({
      name,
      email,
      keyword,
      timestamp,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[log-search] Failed to write to Firestore:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
