// supabase.js - shared Supabase connection + logout (loaded by every page)
const SUPABASE_URL = "https://xmzspbblssnmcvccftgu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtenNwYmJsc3NubWN2Y2NmdGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODU4MjksImV4cCI6MjEwNDU2MTgyOX0.KLnTNPlmf5nLVVN6WBslLoEYyUEtzKclpgVvO6YHpsY";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login-page.html";
}
