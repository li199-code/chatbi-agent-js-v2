import upyun from 'upyun';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  const service = new upyun.Service('askdataservice', 'yiwen', 'Qbm9Xdv2qUOwTvWeKE4TBjxctM9PSr2Q');
  const client = new upyun.Client(service);

  const filePath = path.join(__dirname, `chatbi-agent.tar`);

  await client.putFile('releases/semanticdb.min.js', fs.readFileSync(filePath,
      {
        'encoding': 'utf8',
        'x-upyun-meta-ttl': 1,
      }));
  console.log('publish to UPYUN successfully');
})();
