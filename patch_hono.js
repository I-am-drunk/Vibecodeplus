const fs = require('fs');
const content = fs.readFileSync('server/index.ts', 'utf8');
const newContent = content.replace(
  /bodyLimit\(\{\s*maxSize: 10 \* 1024 \* 1024,\s*onError: \(c\) => c\.json\(\{ ok: false, error: \{ code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' \} \}, 413\),\s*\}\)/,
  "bodyLimit({\n    maxSize: 50 * 1024 * 1024,\n    onError: (c) => c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'Your prompt exceeds the maximum allowed size.' }, 413),\n  })"
);
fs.writeFileSync('server/index.ts', newContent);
