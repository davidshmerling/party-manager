/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PUBLIC_FRONTEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** File System Access API — לא בכל הדפדפנים */
interface Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
}
