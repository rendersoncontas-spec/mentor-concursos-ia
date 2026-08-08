import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('.env.local', 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL="(.*?)"/);

if (dbUrlMatch) {
  const client = new pg.Client({ connectionString: dbUrlMatch[1] });
  client.connect()
    .then(() => client.query("SELECT id, version, active FROM study_plans"))
    .then(res => {
      console.log('Plans:', res.rows);
      return client.query("SELECT day_of_week, count(*) FROM study_plan_items GROUP BY day_of_week");
    })
    .then(res => {
      console.log('Items by day:', res.rows);
      client.end();
    })
    .catch(err => console.error(err));
} else {
  console.log('No DATABASE_URL found');
}
