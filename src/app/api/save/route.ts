import { bodyOf, createSave, failure, nicknameOf, snapshotOf } from "@/lib/save-store";
export const runtime = "nodejs";

// Crée une sauvegarde avec le pseudonyme choisi parmi les propositions.
export async function POST(request: Request) {
  try {
    const body = await bodyOf(request);
    const save = await createSave(nicknameOf(body.nickname), snapshotOf(body.snapshot));
    return Response.json(save, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
