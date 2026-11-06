import { bodyOf, deleteSave, failure, nicknameOf, readSave, snapshotOf, updateSave } from "@/lib/save-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ nickname: string }> };
const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, context: Context) {
  try { return Response.json(await readSave(nicknameOf((await context.params).nickname)), { headers }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const nickname = nicknameOf((await context.params).nickname);
    const body = await bodyOf(request);
    return Response.json(await updateSave(nickname, snapshotOf(body.snapshot), body.etag), { headers });
  } catch (error) { return failure(error); }
}
export async function DELETE(_request: Request, context: Context) {
  try { await deleteSave(nicknameOf((await context.params).nickname)); return Response.json({ deleted: true }, { headers }); }
  catch (error) { return failure(error); }
}
