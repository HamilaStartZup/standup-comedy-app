import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { VenueModel } from '../src/models/Venue';
import { getDepartmentFromPostalCode } from '../src/utils/cityMapping';
import { DEPARTMENT_TO_REGION } from '../src/utils/geographicMatching';

dotenv.config();

async function migrate() {
  await mongoose.connect(process.env.DATABASE_URL!);
  console.log('Connected. Migrating venues...');

  const venues = await VenueModel.find({ department: { $exists: false } });
  console.log(`Found ${venues.length} venues to migrate.`);

  for (const venue of venues) {
    const dept = getDepartmentFromPostalCode(venue.postalCode);
    const region = dept ? (DEPARTMENT_TO_REGION[dept] ?? undefined) : undefined;
    await VenueModel.updateOne(
      { _id: venue._id },
      { $set: { department: dept ?? undefined, region } }
    );
  }

  console.log('Migration complete.');
  await mongoose.disconnect();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
