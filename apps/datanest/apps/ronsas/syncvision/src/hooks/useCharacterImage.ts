/**
 * useCharacterImage — Manages character image upload to storage with retry logic.
 * Returns a function that resolves to a signed URL for the character reference image.
 *
 * Performs client-side validation + compression before upload so we don't ship
 * 10 MB phone photos to storage or to downstream AI providers.
 */

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, validateImageFile } from "@/lib/image-compress";

interface UseCharacterImageOptions {
  characterImageUrl: string | null | undefined;
  userId: string | undefined;
  projectId: string | null;
}

export function useCharacterImage({ characterImageUrl, userId, projectId }: UseCharacterImageOptions) {
  const [uploadingCharImage, setUploadingCharImage] = useState(false);

  const characterImageStorageUrl = useRef<string | null>(null);
  const prevCharacterImageRef = useRef<string | null>(null);

  // Invalidate cache when character image changes
  if (characterImageUrl !== prevCharacterImageRef.current) {
    prevCharacterImageRef.current = characterImageUrl || null;
    characterImageStorageUrl.current = null;
  }

  const getCharacterImageUrl = useCallback(async (): Promise<string | null> => {
    if (characterImageStorageUrl.current) return characterImageStorageUrl.current;
    const rawUrl = characterImageUrl;
    if (!rawUrl || !userId) return null;
    if (rawUrl.startsWith("http")) {
      characterImageStorageUrl.current = rawUrl;
      return rawUrl;
    }
    setUploadingCharImage(true);
    const MAX_UPLOAD_RETRIES = 4;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt++) {
      try {
        const resp = await fetch(rawUrl);
        const rawBlob = await resp.blob();

        // Validate type/size up-front. Bail loudly instead of wasting retries.
        const validation = validateImageFile(rawBlob);
        if (validation.ok === false) {
          toast.error(`Character image rejected: ${validation.reason}`);
          setUploadingCharImage(false);
          return null;
        }

        let uploadBlob: Blob = rawBlob;
        try {
          const compressed = await compressImage(rawBlob);
          uploadBlob = compressed.blob;
          if (!compressed.skipped && compressed.compressedBytes < compressed.originalBytes) {
            const savedKb = Math.round(
              (compressed.originalBytes - compressed.compressedBytes) / 1024
            );
            if (savedKb > 100) {
              console.log(`[character-image] compressed ${savedKb} KB before upload`);
            }
          }
        } catch (compressErr) {
          console.warn("[character-image] compression failed, uploading original", compressErr);
        }

        const ext = uploadBlob.type?.includes("png") ? "png" : "jpg";
        const path = `${userId}/character-ref/${projectId || "tmp"}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("media-uploads")
          .upload(path, uploadBlob, { upsert: true, contentType: uploadBlob.type });
        if (error) throw error;
        const { data: signed } = await supabase.storage
          .from("media-uploads")
          .createSignedUrl(path, 7200);
        if (signed?.signedUrl) {
          characterImageStorageUrl.current = signed.signedUrl;
          setUploadingCharImage(false);
          return signed.signedUrl;
        }
        throw new Error("No signed URL returned");
      } catch (e) {
        lastError = e;
        if (attempt < MAX_UPLOAD_RETRIES - 1) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500;
          toast.info(
            `Character image upload failed (attempt ${attempt + 1}/${MAX_UPLOAD_RETRIES}). Retrying in ${Math.round(backoff / 1000)}s…`
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    console.warn("Failed to upload character image after retries:", lastError);
    toast.error("Character image upload failed after multiple attempts.");
    setUploadingCharImage(false);
    return null;
  }, [characterImageUrl, userId, projectId]);

  return { getCharacterImageUrl, uploadingCharImage, characterImageStorageUrl };
}
