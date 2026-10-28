/**
 * Entry point of the live demo page (npm run build:live): the sample-data app with the presenter guide beside it.
 * The import order matters. boot.ts runs before src/brand.ts reads the URL, and restore.ts runs right after it.
 */
import './boot';
import '../src/brand';
import './restore';
import './downloads';
import '../src/main';
import { mountGuide } from './Guide';

mountGuide();
