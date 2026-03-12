import {
  adrenaSnapshotSchema,
  getAdrenaSnapshotExample,
} from "@/lib/competition/adrena-schema";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    example: await getAdrenaSnapshotExample(),
    schema: adrenaSnapshotSchema,
  });
}
