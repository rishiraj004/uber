/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_MAPBOX_API_KEY?: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
  readonly VITE_RAZORPAY_KEY_SECRET?: string;
  // add other VITE_... env vars your app needs here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
