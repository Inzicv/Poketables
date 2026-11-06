import { failure, suggestNicknames } from "@/lib/save-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Propose 3 pseudonymes libres.
export async function GET() {
  try { return Response.json({ nicknames: await suggestNicknames(3) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
