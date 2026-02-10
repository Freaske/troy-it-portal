import { NextResponse } from "next/server";

import { getPortalMeta } from "@/lib/portal";

export async function GET() {
  const meta = await getPortalMeta();
  return NextResponse.json(meta);
}
