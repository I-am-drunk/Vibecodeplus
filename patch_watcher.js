const fs = require('fs');
const content = fs.readFileSync('server/ssh/watcher.ts', 'utf8');

let newContent = content.replace(
  /const MAX_COOLDOWN_MS = 120_000/,
  "const MAX_COOLDOWN_MS = 300_000"
);

newContent = newContent.replace(
  /    \/\/ Bounded backoff with jitter\n    const baseCooldown = Math\.min\(BASE_COOLDOWN_MS \* 2 \*\* \(context\.forbiddenFailures - 1\), MAX_COOLDOWN_MS\)\n    const jitter = Math\.random\(\) \* 2000 \/\/ 0-2s jitter\n    const cooldownMs = baseCooldown \+ jitter\n    context\.cooldownMs = cooldownMs/,
  `    const cooldownMs = MAX_COOLDOWN_MS; // massive backoff
    context.cooldownMs = cooldownMs`
);

newContent = newContent.replace(
  /    if \(featureFlags\.watcher_fsm_v2\) \{/,
  `    if (true) { // enforce fsm`
);

fs.writeFileSync('server/ssh/watcher.ts', newContent);
