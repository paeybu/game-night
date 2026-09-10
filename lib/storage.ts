/** Public URL for an object in a public bucket. Works on server and client. */
export function publicUrl(bucket: "photos" | "candidates", path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
