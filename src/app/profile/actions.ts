"use server";

import { revalidatePath } from "next/cache";
import { getDb, saveProfile } from "@/lib/db";
import { checkResume } from "@/lib/profile";

export type SaveState =
  | { status: "idle" }
  | { status: "saved"; updatedAt: string; text: string }
  | { status: "error"; error: string };

export async function saveResume(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const check = checkResume(formData.get("resume"));
  if (!check.ok) return { status: "error", error: check.error };
  const { updatedAt } = saveProfile(getDb(), check.text);
  revalidatePath("/profile");
  return { status: "saved", updatedAt, text: check.text };
}
