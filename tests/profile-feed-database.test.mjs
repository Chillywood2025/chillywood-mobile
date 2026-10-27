// Execute the actual canonical migration/RLS regression in the ordinary test
// discovery path. The large isolated benchmark remains opt-in via
// PROFILE_FEED_SCALE=1; never enable it against a hosted database.
import '../supabase/tests/profile_relationship_feed_cursor.test.mjs';
