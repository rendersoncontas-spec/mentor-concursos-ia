import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('.env.local', 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL="(.*?)"/);

if (dbUrlMatch) {
  // Use connection string but replace the host with aws-0-sa-east-1.pooler.supabase.com to avoid dns issues in the container
  let connString = dbUrlMatch[1];
  connString = connString.replace('db.snlwfnwjrcqtlilhwgfm.supabase.co', 'aws-0-sa-east-1.pooler.supabase.com');

  const client = new pg.Client({ connectionString: connString });
  
  async function run() {
    try {
      await client.connect();
      console.log('Connected to DB');
      
      const { rows: users } = await client.query("SELECT id FROM auth.users LIMIT 1");
      if (users.length === 0) return console.log('No users found');
      const userId = users[0].id;
      
      const { rows: targets } = await client.query("SELECT * FROM user_targets WHERE user_id = $1 AND is_active = true", [userId]);
      console.log('Active Target:', targets);
      
      if (targets.length > 0) {
        const { rows: disciplines } = await client.query("SELECT * FROM user_disciplines WHERE user_id = $1 AND target_id = $2", [userId, targets[0].id]);
        console.log('User Disciplines for target:', disciplines.length);
      }
      
      const { rows: plans } = await client.query("SELECT * FROM study_plans WHERE user_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1", [userId]);
      console.log('Active Plan:', plans);
      
      if (plans.length > 0) {
        const { rows: items } = await client.query("SELECT day_of_week, count(*) FROM study_plan_items WHERE study_plan_id = $1 GROUP BY day_of_week", [plans[0].id]);
        console.log('Plan items by day:', items);
      }
      
    } catch (e) {
      console.error(e);
    } finally {
      client.end();
    }
  }
  
  run();
} else {
  console.log('No DATABASE_URL found');
}
