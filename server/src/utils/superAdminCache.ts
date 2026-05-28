import { UserModel } from '../models/User';

let cachedIds: string[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export const getSuperAdminIds = async (): Promise<string[]> => {
  if (Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedIds;
  }
  const admins = await UserModel.find({ role: 'SUPER_ADMIN', isActive: true })
    .select('_id')
    .lean();
  cachedIds = admins.map(a => a._id.toString());
  cacheTimestamp = Date.now();
  return cachedIds;
};
