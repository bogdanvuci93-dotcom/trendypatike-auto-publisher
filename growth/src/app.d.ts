/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Platform {
      env?: {
        DB?: D1Database;
        RECORDINGS?: R2Bucket;
        APP_ENCRYPTION_KEY?: string;
        SHOPIFY_CLIENT_ID?: string;
        SHOPIFY_CLIENT_SECRET?: string;
        META_APP_ID?: string;
        META_APP_SECRET?: string;
        META_GRAPH_VERSION?: string;
      };
    }
  }
}

export {};
