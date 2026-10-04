// Brand DNA + Products + Moodboards — typed client helpers.
// Generation reads from these tables instead of scraping per request.

import { supabase } from "@/integrations/supabase/client";

export interface BrandDna {
  id: string;
  user_id: string;
  brand_name: string | null;
  website_url: string | null;
  tagline: string | null;
  mission: string | null;
  value_props: string[];
  voice_tone: string | null;
  voice_words_use: string[];
  voice_words_avoid: string[];
  audience: string | null;
  competitors: string | null;
  colors: Record<string, unknown>;
  fonts: Record<string, unknown>;
  logo_url: string | null;
  extra_guidelines: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  price_display: string | null;
  category: string | null;
  key_features: string[];
  hero_image_url: string | null;
  extra_images: string[];
  source_url: string | null;
  last_imported_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Moodboard {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  analysis: Record<string, unknown>;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoodboardImage {
  id: string;
  moodboard_id: string;
  user_id: string;
  image_url: string;
  position: number;
  created_at: string;
}

// ---------- Brand DNA ----------
export async function getMyBrandDna(): Promise<BrandDna | null> {
  const { data, error } = await supabase
    .from("brand_dna")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as BrandDna | null;
}

export async function upsertMyBrandDna(
  patch: Partial<Omit<BrandDna, "id" | "user_id" | "created_at" | "updated_at">>,
): Promise<BrandDna> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const payload = { user_id: uid, ...patch } as never;
  const { data, error } = await supabase
    .from("brand_dna")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as BrandDna;
}

// ---------- Products ----------
export async function listMyProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Product | null;
}

export async function createProduct(input: {
  name: string;
  description?: string | null;
  price_display?: string | null;
  category?: string | null;
  key_features?: string[];
  hero_image_url?: string | null;
  extra_images?: string[];
  source_url?: string | null;
}): Promise<Product> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("products")
    .insert({ user_id: uid, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "user_id" | "created_at" | "updated_at">>,
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// Upload a file to library bucket and return a 7d signed URL.
export async function uploadProductImage(file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${uid}/products/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("library")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data: signed, error: signErr } = await supabase.storage
    .from("library")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

// Background import — calls extract-source-brief + writes a Product row.
export async function importProductFromUrl(url: string): Promise<Product> {
  const { data, error } = await supabase.functions.invoke("import-product-from-url", {
    body: { url },
  });
  if (error) throw error;
  if (!data?.product) throw new Error("Import returned no product");
  return data.product as Product;
}

// ---------- Moodboards ----------
export async function listMyMoodboards(): Promise<Moodboard[]> {
  const { data, error } = await supabase
    .from("moodboards")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Moodboard[];
}

export async function createMoodboard(name: string): Promise<Moodboard> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("moodboards")
    .insert({ user_id: uid, name })
    .select()
    .single();
  if (error) throw error;
  return data as Moodboard;
}

export async function deleteMoodboard(id: string): Promise<void> {
  const { error } = await supabase.from("moodboards").delete().eq("id", id);
  if (error) throw error;
}

export async function listMoodboardImages(moodboardId: string): Promise<MoodboardImage[]> {
  const { data, error } = await supabase
    .from("moodboard_images")
    .select("*")
    .eq("moodboard_id", moodboardId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MoodboardImage[];
}

export async function addMoodboardImage(moodboardId: string, file: File): Promise<MoodboardImage> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${uid}/moodboards/${moodboardId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("library")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data: signed, error: signErr } = await supabase.storage
    .from("library")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signErr) throw signErr;
  const { data, error } = await supabase
    .from("moodboard_images")
    .insert({ moodboard_id: moodboardId, user_id: uid, image_url: signed.signedUrl })
    .select()
    .single();
  if (error) throw error;
  return data as MoodboardImage;
}

export async function deleteMoodboardImage(id: string): Promise<void> {
  const { error } = await supabase.from("moodboard_images").delete().eq("id", id);
  if (error) throw error;
}

export async function analyzeMoodboard(moodboardId: string): Promise<Moodboard> {
  const { data, error } = await supabase.functions.invoke("analyze-moodboard", {
    body: { moodboardId },
  });
  if (error) throw error;
  return data.moodboard as Moodboard;
}
