import 'server-only';
import {database} from './database';
import {bucket} from './storage';

// Lazy clients allow a production build without connecting to live services.
export const env = {DB:database,BUCKET:bucket};
