// Cloud sync connection (Supabase). Fill these two values after creating the
// project — see docs/sync.md for the setup steps.
//
// The publishable ("anon") key is DESIGNED to be public: it only grants what
// Row-Level Security allows, and our policy limits every signed-in user to
// their own row. Never put the service_role key here — this file ships in a
// public repo.
export const SYNC = {
  url: '', // e.g. 'https://abcdefghijklm.supabase.co'
  key: '', // the publishable / anon key
};

export const configured = () => !!(SYNC.url && SYNC.key);
