import { connection } from "next/server";
import { readOrSeedServerStore } from "@/app/lib/server-store";

export async function GET() {
  await connection();
  try {
    const state = await readOrSeedServerStore();
    return Response.json(state, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load workspace state";
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
