declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    DEMO_LOGIN_ENABLED?: string;
    ADMIN_PASSWORD?: string;
    STUDENT_PASSWORD?: string;
    TEAM2_PASSWORD?: string;
    TEAM3_PASSWORD?: string;
    TEAM4_PASSWORD?: string;
    TEAM5_PASSWORD?: string;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPENAI_REQUESTS_ENABLED?: string;
  }
}
